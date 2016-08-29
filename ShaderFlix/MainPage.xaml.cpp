//
// MainPage.xaml.cpp
// Implementation of the MainPage class.
//

#include "pch.h"
#include "MainPage.xaml.h"

#include <sstream>
#include "HTTPDownloader.h"
#include "rapidjson/document.h"
#include "Utils.h"

using namespace ShaderFlix;

using namespace Platform;
using namespace Windows::Foundation;
using namespace Windows::Foundation::Collections;
using namespace Windows::UI::Xaml;
using namespace Windows::UI::Xaml::Controls;
using namespace Windows::UI::Xaml::Controls::Primitives;
using namespace Windows::UI::Xaml::Data;
using namespace Windows::UI::Xaml::Input;
using namespace Windows::UI::Xaml::Media;
using namespace Windows::UI::Xaml::Navigation;

// The Blank Page item template is documented at http://go.microsoft.com/fwlink/?LinkId=402352&clcid=0x409

MainPage::MainPage() : mPlaying(false), http_number(0)
{
	auto deviceFamily = Windows::System::Profile::AnalyticsInfo::VersionInfo->DeviceFamily;
	mIsXbox = (deviceFamily == "Windows.Xbox");

	mItems = ref new Platform::Collections::Vector<ShaderItem^>();

	InitializeComponent();

	//mShaderFlixId = "ldfGWn"; // "Truchet Tentacles"  https://www.shadertoy.com/view/ldfGWn

	mOpenGLES = new OpenGLES();

	Windows::UI::Core::CoreWindow^ window = Windows::UI::Xaml::Window::Current->CoreWindow;

	window->VisibilityChanged +=
		ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow^, Windows::UI::Core::VisibilityChangedEventArgs^>(this, &MainPage::OnVisibilityChanged);

	this->Loaded +=
		ref new Windows::UI::Xaml::RoutedEventHandler(this, &MainPage::OnPageLoaded);

	window->KeyDown += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::KeyEventArgs ^>(this, &MainPage::OnKeyDown);
	window->KeyUp += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::KeyEventArgs ^>(this, &MainPage::OnKeyUp);
	Windows::UI::Core::SystemNavigationManager::GetForCurrentView()->BackRequested += ref new Windows::Foundation::EventHandler<Windows::UI::Core::BackRequestedEventArgs ^>(this, &ShaderFlix::MainPage::OnBackRequested);

	window->PointerEntered += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::PointerEventArgs ^>(this, &MainPage::OnPointerEntered);
	window->PointerExited += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::PointerEventArgs ^>(this, &MainPage::OnPointerExited);
	window->PointerMoved += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::PointerEventArgs ^>(this, &MainPage::OnPointerMoved);
	window->PointerPressed += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::PointerEventArgs ^>(this, &MainPage::OnPointerPressed);
	window->PointerReleased += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::PointerEventArgs ^>(this, &MainPage::OnPointerReleased);

	window->SizeChanged += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::WindowSizeChangedEventArgs ^>(this, &MainPage::OnSizeChanged);

	Windows::UI::ViewManagement::ApplicationViewTitleBar^ formattableTitleBar = Windows::UI::ViewManagement::ApplicationView::GetForCurrentView()->TitleBar;
	formattableTitleBar->BackgroundColor = Windows::UI::Colors::Transparent;
	formattableTitleBar->ButtonBackgroundColor = Windows::UI::Colors::Transparent;
	formattableTitleBar->ButtonInactiveBackgroundColor = Windows::UI::Colors::Transparent;
	formattableTitleBar->ButtonInactiveForegroundColor = Windows::UI::Colors::Gray;
	formattableTitleBar->ButtonForegroundColor = Windows::UI::ColorHelper::FromArgb(0xFF, 0xFE, 0x80, 0x20);
	formattableTitleBar->ButtonPressedForegroundColor = Windows::UI::ColorHelper::FromArgb(0xFF, 0xFE, 0x80, 0x20);
	formattableTitleBar->ButtonPressedBackgroundColor = Windows::UI::ColorHelper::FromArgb(0xFF, 0x40, 0x40, 0x40);
	formattableTitleBar->ButtonHoverBackgroundColor = Windows::UI::Colors::Black;
	formattableTitleBar->ButtonHoverForegroundColor = Windows::UI::Colors::White;

	Windows::ApplicationModel::Core::CoreApplicationViewTitleBar^ coreTitleBar = Windows::ApplicationModel::Core::CoreApplication::GetCurrentView()->TitleBar;
	coreTitleBar->LayoutMetricsChanged += ref new Windows::Foundation::TypedEventHandler<Windows::ApplicationModel::Core::CoreApplicationViewTitleBar ^, Platform::Object ^>(this, &MainPage::OnLayoutMetricsChanged);
	coreTitleBar->ExtendViewIntoTitleBar = true;
	Windows::UI::Xaml::Window::Current->SetTitleBar(titleBar);

	Windows::UI::ViewManagement::ApplicationView::GetForCurrentView()->VisibleBoundsChanged += ref new Windows::Foundation::TypedEventHandler<Windows::UI::ViewManagement::ApplicationView ^, Platform::Object ^>(this, &ShaderFlix::MainPage::OnVisibleBoundsChanged);
	

	if (mIsXbox)
	{
		buttonFullScreen->Width = 0;
		buttonFullScreen->Height = 0;
		buttonFullScreen2->Width = 0;
		buttonFullScreen2->Height = 0;
		auto visb = Windows::UI::ViewManagement::ApplicationView::GetForCurrentView()->VisibleBounds;
		galleryGridHost->Margin = Windows::UI::Xaml::Thickness(visb.Left, visb.Top, visb.Left, visb.Top);
		
		galleryGridHost->BorderBrush = ref new Windows::UI::Xaml::Media::SolidColorBrush(Windows::UI::ColorHelper::FromArgb(0xFF, 0x40, 0x40, 0x40));
		galleryGridHost->BorderThickness = Windows::UI::Xaml::Thickness(2, 2, 2, 2);

		Windows::Gaming::Input::Gamepad::GamepadAdded += ref new Windows::Foundation::EventHandler<Windows::Gaming::Input::Gamepad ^>(this, &ShaderFlix::MainPage::OnGamepadAdded);
		Windows::Gaming::Input::Gamepad::GamepadRemoved += ref new Windows::Foundation::EventHandler<Windows::Gaming::Input::Gamepad ^>(this, &ShaderFlix::MainPage::OnGamepadRemoved);

	}


	FetchQuery();
}

void MainPage::OnPageLoaded(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e)
{
	// The SwapChainPanel has been created and arranged in the page layout, so EGL can be initialized.
	CreateRenderSurface();
	logo->Height = searchBox->ActualHeight-2;

	auto settings = Windows::Storage::ApplicationData::Current->RoamingSettings->Values;
	
	if (!settings->HasKey("LicenseAccepted"))
	{
		ShowLicense(true);
	}

	if (!settings->HasKey("PresetsCopied"))
	{
		auto workItemHandler = ref new Windows::System::Threading::WorkItemHandler([this, settings](Windows::Foundation::IAsyncAction ^ action)
		{
			Windows::Storage::StorageFolder^ appFolder = Windows::ApplicationModel::Package::Current->InstalledLocation;
			std::wstring path = appFolder->Path->Data();
			path += L"\\PresetData\\presets";

			CachePresets(std::string(path.begin(), path.end()));
			settings->Insert("PresetsCopied", "yes");
		});
		Windows::System::Threading::ThreadPool::RunAsync(workItemHandler, Windows::System::Threading::WorkItemPriority::High, Windows::System::Threading::WorkItemOptions::TimeSliced);
	}

	shadersList->Focus(Windows::UI::Xaml::FocusState::Keyboard);
}


void MainPage::OnVisibilityChanged(Windows::UI::Core::CoreWindow^ sender, Windows::UI::Core::VisibilityChangedEventArgs^ args)
{
	if (mPlaying)
	{
		if (args->Visible && mRenderSurface != EGL_NO_SURFACE)
		{
			progressPreRender->IsActive = true;
			StartRenderLoop();
		}
		else
		{
			StopRenderLoop();
		}
	}
}

void MainPage::CreateRenderSurface()
{
	if (mOpenGLES && mRenderSurface == EGL_NO_SURFACE)
	{
		// The app can configure the the SwapChainPanel which may boost performance.
		// By default, this template uses the default configuration.
		//mRenderSurface = mOpenGLES->CreateSurface(swapchain, nullptr, nullptr);

		int iRenderWidth = 1920;

		float w = (float)swapchain->ActualWidth;
		float h = (float)swapchain->ActualHeight;
		float tw = (float) iRenderWidth;
		float th = tw * h / w;

		Size customRenderSurfaceSize = Size(tw, th);
		mRenderSurface = mOpenGLES->CreateSurface(swapchain, &customRenderSurfaceSize, nullptr);
		mOpenGLES->MakeCurrent(mRenderSurface);

		std::string gpu = OpenGLES::GetGPUName();
		if (findstr_ignorecase(gpu, "NVIDIA") == gpu.end())
		{
			iRenderWidth = 960;
			tw = (float)iRenderWidth;
			th = tw * h / w;
			
			mOpenGLES->DestroySurface(mRenderSurface);
			customRenderSurfaceSize = Size(tw, th);
			mRenderSurface = mOpenGLES->CreateSurface(swapchain, &customRenderSurfaceSize, nullptr);
		}

		// You can configure the SwapChainPanel to render at a lower resolution and be scaled up to
		// the swapchain panel size. This scaling is often free on mobile hardware.
		//
		// One way to configure the SwapChainPanel is to specify precisely which resolution it should render at.
		// Size customRenderSurfaceSize = Size(800, 600);
		// mRenderSurface = mOpenGLES->CreateSurface(swapChainPanel, &customRenderSurfaceSize, nullptr);
		//
		// Another way is to tell the SwapChainPanel to render at a certain scale factor compared to its size.
		// e.g. if the SwapChainPanel is 1920x1280 then setting a factor of 0.5f will make the app render at 960x640
		// float customResolutionScale = 0.5f;
		// mRenderSurface = mOpenGLES->CreateSurface(swapChainPanel, nullptr, &customResolutionScale);
		// 
	}
}

void MainPage::DestroyRenderSurface()
{
	if (mOpenGLES)
	{
		mOpenGLES->DestroySurface(mRenderSurface);
	}
	mRenderSurface = EGL_NO_SURFACE;
}

void MainPage::RecoverFromLostDevice()
{
	// Stop the render loop, reset OpenGLES, recreate the render surface
	// and start the render loop again to recover from a lost device.

	StopRenderLoop();

	swapchain->Dispatcher->RunAsync(Windows::UI::Core::CoreDispatcherPriority::High, ref new Windows::UI::Core::DispatchedHandler([=]()
	{
		imageBG->Visibility = Windows::UI::Xaml::Visibility::Visible;
		progressPreRender->IsActive = true;
	}, CallbackContext::Any));

	{
		Concurrency::critical_section::scoped_lock lock(mRenderSurfaceCriticalSection);

		DestroyRenderSurface();
		mOpenGLES->Reset();
		CreateRenderSurface();
	}

	StartRenderLoop();
}

void MainPage::StartRenderLoop()
{
	// If the render loop is already running then do not start another thread.
	if (mRenderLoopWorker != nullptr && mRenderLoopWorker->Status == Windows::Foundation::AsyncStatus::Started)
	{
		return;
	}

	if (mIsXbox)
	{
		if (mGamePad == nullptr && Windows::Gaming::Input::Gamepad::Gamepads->Size)
		{
			mGamePad = Windows::Gaming::Input::Gamepad::Gamepads->GetAt(0);
		}
	}


	// Create a task for rendering that will be run on a background thread.
	auto workItemHandler = ref new Windows::System::Threading::WorkItemHandler([this](Windows::Foundation::IAsyncAction ^ action)
	{
		Concurrency::critical_section::scoped_lock lock(mRenderSurfaceCriticalSection);

		float xboxMouseX = 0, xboxMouseY = 0;
		Platform::String^ errorText = L"";

		mOpenGLES->MakeCurrent(mRenderSurface);

		if (mRenderer.get() == nullptr)
		{
			EGLint panelWidth = 0;
			EGLint panelHeight = 0;
			mOpenGLES->GetSurfaceDimensions(mRenderSurface, &panelWidth, &panelHeight);

			xboxMouseX = (float)panelWidth / 2;
			xboxMouseY = (float) panelHeight / 2;

			mRenderer = std::make_shared<ShaderRenderer>();
			mRenderer->UpdateWindowSize(panelWidth, panelHeight);
			bool bInitOK = false;

			try
			{
				bInitOK = mRenderer->InitShader(APP_KEY, mShaderFlixId.c_str());
			}
			catch (...)
			{
				errorText = L"Sorry, I cannot initialize this shader.";
				assert(!"Exception while initializing shader");
			}

			if (!bInitOK)
			{
				errorText = L"Sorry, I cannot initialize this shader.";
				mRenderer.reset();

				swapchain->Dispatcher->RunAsync(Windows::UI::Core::CoreDispatcherPriority::High, ref new Windows::UI::Core::DispatchedHandler([=]()
				{
					progressPreRender->IsActive = false;

					if (errorText->Length())
					{
						Windows::UI::Popups::MessageDialog^ dlg = ref new Windows::UI::Popups::MessageDialog(errorText, "Error");
						dlg->ShowAsync();
					}

					HandleBack();
				}, CallbackContext::Any));
			}
			else
			{
				swapchain->Dispatcher->RunAsync(Windows::UI::Core::CoreDispatcherPriority::High, ref new Windows::UI::Core::DispatchedHandler([=]()
				{
					focusButton->Visibility = Windows::UI::Xaml::Visibility::Visible;
					focusButton->Focus(Windows::UI::Xaml::FocusState::Programmatic);
				}, CallbackContext::Any));

			}
		}

		bool bFirstFrameDone = false;

		while (action->Status == Windows::Foundation::AsyncStatus::Started)
		{
			if (!mRenderer)
				continue;

			EGLint panelWidth = 0;
			EGLint panelHeight = 0;
			mOpenGLES->GetSurfaceDimensions(mRenderSurface, &panelWidth, &panelHeight);

			// Logic to update the scene could go here
			mRenderer->UpdateWindowSize(panelWidth, panelHeight);

			if (mIsXbox && mGamePad != nullptr)
			{
				auto reading = mGamePad->GetCurrentReading();
				float x = (float) reading.LeftThumbstickX;
				if (abs(x) < 0.06f)
					x = 0;
				float y = (float) reading.LeftThumbstickY;
				if (abs(y) < 0.06f)
					y = 0;
				bool bLeftClick = (reading.Buttons & Windows::Gaming::Input::GamepadButtons::A) != Windows::Gaming::Input::GamepadButtons::None;
				
				xboxMouseX += 10 * x;
				if (xboxMouseX < 0)
					xboxMouseX = 0;
				else if (xboxMouseX >= panelWidth)
					xboxMouseX = (float) panelWidth - 1;

				xboxMouseY += 10 * y;
				if (xboxMouseY < 0)
					xboxMouseY = 0;
				else if (xboxMouseY >= panelHeight)
					xboxMouseY = (float) panelWidth - 1;

				mRenderer->SetMouseState(true, (int)xboxMouseX, (int)xboxMouseY, bLeftClick);
			}

			bool bNeedToStop = false;

			try
			{
				mRenderer->Draw();
			}
			catch (...)
			{
				assert(!"Exception while rendering shader");
				errorText = L"Sorry, there was an error while playing this shader.";
				bNeedToStop = true;
			}


			if (!bNeedToStop)
			{
				// The call to eglSwapBuffers might not be successful (i.e. due to Device Lost)
				// If the call fails, then we must reinitialize EGL and the GL resources.
				if (mOpenGLES->SwapBuffers(mRenderSurface) != GL_TRUE)
				{
					// XAML objects like the SwapChainPanel must only be manipulated on the UI thread.
					swapchain->Dispatcher->RunAsync(Windows::UI::Core::CoreDispatcherPriority::High, ref new Windows::UI::Core::DispatchedHandler([=]()
					{
						RecoverFromLostDevice();
					}, CallbackContext::Any));

					return;
				}
			}

			if (!bFirstFrameDone)
			{
				bFirstFrameDone = true;

				swapchain->Dispatcher->RunAsync(Windows::UI::Core::CoreDispatcherPriority::High, ref new Windows::UI::Core::DispatchedHandler([=]()
				{
					if (mIsXbox)
					{
						Window::Current->CoreWindow->PointerCursor = nullptr;
					}

					progressPreRender->IsActive = false;
					imageBG->Visibility = Windows::UI::Xaml::Visibility::Collapsed;
				}, CallbackContext::Any));
			}

			if (bNeedToStop)
			{
				swapchain->Dispatcher->RunAsync(Windows::UI::Core::CoreDispatcherPriority::High, ref new Windows::UI::Core::DispatchedHandler([=]()
				{
					if (errorText->Length())
					{
						Windows::UI::Popups::MessageDialog^ dlg = ref new Windows::UI::Popups::MessageDialog(errorText, "Error");
						dlg->ShowAsync();
					}

					HandleBack();
				}, CallbackContext::Any));
				break;
			}
		}

		mRenderer.reset();

		swapchain->Dispatcher->RunAsync(Windows::UI::Core::CoreDispatcherPriority::High, ref new Windows::UI::Core::DispatchedHandler([=]()
		{
			focusButton->Visibility = Windows::UI::Xaml::Visibility::Collapsed;
			progressPreRender->IsActive = false;
		}, CallbackContext::Any));
	});

	// Run task on a dedicated high priority background thread.
	mRenderLoopWorker = Windows::System::Threading::ThreadPool::RunAsync(workItemHandler, Windows::System::Threading::WorkItemPriority::High, Windows::System::Threading::WorkItemOptions::TimeSliced);
}

void MainPage::StopRenderLoop()
{
	if (mIsXbox)
	{
		Window::Current->CoreWindow->PointerCursor = ref new Windows::UI::Core::CoreCursor(Windows::UI::Core::CoreCursorType::Arrow, 0);
	}

	if (mRenderLoopWorker)
	{
		mRenderLoopWorker->Cancel();
		mRenderLoopWorker = nullptr;
	}
	if (mRenderer.get())
		mRenderer.reset();
}


void MainPage::SetKeyState(Windows::System::VirtualKey key, bool pressed)
{
	if (mRenderer)
	{
		unsigned int _key = (unsigned int) key;
		if (key == Windows::System::VirtualKey::GamepadLeftThumbstickUp)
			_key = (unsigned int) Windows::System::VirtualKey::Up;
		if (key == Windows::System::VirtualKey::GamepadLeftThumbstickLeft)
			_key = (unsigned int) Windows::System::VirtualKey::Left;
		if (key == Windows::System::VirtualKey::GamepadLeftThumbstickDown)
			_key = (unsigned int) Windows::System::VirtualKey::Down;
		if (key == Windows::System::VirtualKey::GamepadLeftThumbstickRight)
			_key = (unsigned int) Windows::System::VirtualKey::Right;

		mRenderer->SetKeyState(_key, pressed);
	}
}

void MainPage::searchBox_QuerySubmitted(Windows::UI::Xaml::Controls::SearchBox^ sender, Windows::UI::Xaml::Controls::SearchBoxQuerySubmittedEventArgs^ args)
{
	FetchQuery();
	shadersList->Focus(Windows::UI::Xaml::FocusState::Keyboard);
}


void MainPage::FetchQuery()
{
	progress->IsActive = true;
	shadersList->Visibility = Windows::UI::Xaml::Visibility::Collapsed;
	shadersList->ItemsSource = nullptr;
	mItems = ref new Platform::Collections::Vector<ShaderItem^>();

	std::wstring wq = searchBox->Text->Data();
	std::ostringstream url;

	if (wq.length() == 0)
	{
		// get popular
		url << "https://www.shadertoy.com/api/v1/shaders/query?sort=popular&key=" << APP_KEY;
	}
	else
	{
		// execute query 
		std::string q(wq.begin(), wq.end());

		url << "https://www.shadertoy.com/api/v1/shaders/query/" << url_encode(q) << "?sort=popular&key=" << APP_KEY;
	}

	std::string urlStr = url.str();

	searchBox->IsEnabled = false;

	concurrency::create_async([this, urlStr]()
	{
		HTTPDownloader downloader;

		auto json = downloader.downloadString(urlStr);

		if (json.length())
		{
			rapidjson::Document doc;
			doc.Parse(json.c_str());
			
			if (!doc.HasParseError() && doc.HasMember("Shaders"))
			{
				int cnt = doc["Shaders"].GetInt();
				if (cnt > 0)
				{
					auto items = doc["Results"].GetArray();

					for (unsigned int i = 0; (i < items.Size() && i < 300); i++)
					{
						ShaderItem^ item = ref new ShaderItem();
						std::string id = items[i].GetString();
						std::wstring wid(id.begin(), id.end());

						item->ShaderId = ref new Platform::String(wid.c_str());
						item->ShaderPreview = ref new Platform::String(L"http://reindernijhoff.net/shadertoythumbs/") + item->ShaderId + L".jpg";

						mItems->Append(item);
					}
				}
			}
		}


		this->Dispatcher->RunAsync(Windows::UI::Core::CoreDispatcherPriority::High, ref new Windows::UI::Core::DispatchedHandler([=]()
		{
			shadersList->ItemsSource = nullptr;
			shadersList->ItemsSource = mItems;
			progress->IsActive = false;
			shadersList->Visibility = Windows::UI::Xaml::Visibility::Visible;
			searchBox->IsEnabled = true;
		}, CallbackContext::Any));
	});

	
}



void MainPage::shadersList_ContainerContentChanging(Windows::UI::Xaml::Controls::ListViewBase^ sender, Windows::UI::Xaml::Controls::ContainerContentChangingEventArgs^ args)
{
	if (mItems == nullptr || mItems->Size == 0)
		return;

	int index = args->ItemIndex;
	if (index == -1 || (unsigned)index >= mItems->Size)
		return;

	auto item = mItems->GetAt((unsigned) index);

	if (item->ShaderName->Length() > 0)
		return;

	item->ShaderName = "Loading...";
	
	concurrency::create_async([this, index]()
	{
		{
			std::unique_lock<std::mutex> lock(http_mutex);
			if (http_number >= 5)
			{
				http_cv.wait(lock);
			}
			
			http_number++;
		}
		

		HTTPDownloader downloader;
		auto item = mItems->GetAt((unsigned) index);

		std::ostringstream shaderUrl;
		std::wstring wid(item->ShaderId->Data());
		std::string id(wid.begin(), wid.end());
		
		shaderUrl << "https://www.shadertoy.com/api/v1/shaders/" << id << "?key=" << APP_KEY;
		auto json = downloader.downloadString(shaderUrl.str(), true);

		{
			std::unique_lock<std::mutex> lock(http_mutex);
			http_number--;
		}
		http_cv.notify_one();

		rapidjson::Document docShader;
		docShader.Parse(json.c_str());

		std::string name = "[Error]";
		std::string shaderInfo;
		int likes = 0;
		bool hasBuffer = false;

		if (!docShader.HasParseError() && docShader.HasMember("Shader"))
		{
			const rapidjson::Value& shader = docShader["Shader"];
			const rapidjson::Value& info = shader["info"];
			name = format("%s by %s", info["name"].GetString(), info["username"].GetString());
			likes = info["likes"].GetInt();

			const rapidjson::Value& renderpassArr = shader["renderpass"];
			unsigned int passCount = renderpassArr.GetArray().Size();

			for (unsigned int i = 0; i < passCount; i++)
			{
				const rapidjson::Value& renderpass = renderpassArr[i];
				std::string type = renderpass["type"].GetString();
				if (type == "buffer")
				{
					hasBuffer = true;
				}
				else if (type == "image")
				{
					std::string codeComment;
					std::string code = renderpass["code"].GetString();
					
					auto lines = splitpath(code, std::set<char> {'\n'});
					for (size_t m = 0; m < lines.size(); m++)
					{
						if (lines[m].length() < 4)
						{
							lines.erase(lines.begin() + m);
							m--;
						}
					}
					auto first = code.find("//");
					if (first == 0)
					{
						if (lines.size())
						{
							codeComment = lines[0];
							if (lines.size() > 1 && lines[1].find("//") == 0)
							{
								codeComment += "\n";
								codeComment += lines[1];
							}
						}
					}
					shaderInfo = format("%s\n\nInformation from header comments (may be just code comments):\n\n%s", 
						info["description"].GetString(), codeComment.c_str());
				}
			}

		}
		else
		{
			HTTPDownloader::DeleteCacheItem(shaderUrl.str().c_str());
		}
			
		std::wstring wname(name.begin(), name.end());
		std::wstring winfo(shaderInfo.begin(), shaderInfo.end());

		swapchain->Dispatcher->RunAsync(Windows::UI::Core::CoreDispatcherPriority::High, ref new Windows::UI::Core::DispatchedHandler([=]()
		{
			item->ShaderName = ref new Platform::String(wname.c_str());
			item->ShaderLikes = likes.ToString();
			item->ShaderInfo = ref new Platform::String(winfo.c_str());
			item->NotSupported = hasBuffer;
			mItems->SetAt(index, item);

		}, CallbackContext::Any));
	});
}


void MainPage::PlayShader(const std::string& id)
{
	StopRenderLoop();
	mPlaying = false;

	mShaderFlixId = id;
	
	if (mShaderFlixId.length() > 0)
	{
		try
		{
			progressPreRender->IsActive = true;
			galleryGridHost->Visibility = Windows::UI::Xaml::Visibility::Collapsed;
			
			StartRenderLoop();
			mPlaying = true;
			Windows::UI::Core::SystemNavigationManager::GetForCurrentView()->AppViewBackButtonVisibility = Windows::UI::Core::AppViewBackButtonVisibility::Visible;
			playingButtons->Visibility = Windows::UI::Xaml::Visibility::Visible;
		}
		catch (...)
		{
			assert(!"Cannot play!");
		}
	}
}



void MainPage::ToggleFullscreen()
{
	Windows::ApplicationModel::Core::CoreApplicationViewTitleBar^ coreTitleBar = Windows::ApplicationModel::Core::CoreApplication::GetCurrentView()->TitleBar;

	if (Windows::UI::ViewManagement::ApplicationView::GetForCurrentView()->IsFullScreenMode)
	{
		Windows::UI::ViewManagement::ApplicationView::GetForCurrentView()->ExitFullScreenMode();
		coreTitleBar->ExtendViewIntoTitleBar = true;
	}
	else
	{
		coreTitleBar->ExtendViewIntoTitleBar = false;
		Windows::UI::ViewManagement::ApplicationView::GetForCurrentView()->TryEnterFullScreenMode();
	}

}



void MainPage::OnKeyDown(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::KeyEventArgs ^args)
{
	if (args->VirtualKey == Windows::System::VirtualKey::Escape 
		 || args->VirtualKey == Windows::System::VirtualKey::Back 
		 || (mPlaying && args->VirtualKey == Windows::System::VirtualKey::GamepadB))
	{
		return;
	}

	if (galleryGridHost->Visibility != Windows::UI::Xaml::Visibility::Visible && mPlaying)
	{
		SetKeyState(args->VirtualKey, true);
	}
}


void MainPage::OnKeyUp(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::KeyEventArgs ^args)
{
	if (args->VirtualKey == Windows::System::VirtualKey::Escape ||
		args->VirtualKey == Windows::System::VirtualKey::Back ||
		(mPlaying && args->VirtualKey == Windows::System::VirtualKey::GamepadB))
	{
		HandleBack();
		return;
	}

	/*if (galleryGridHost->Visibility == Windows::UI::Xaml::Visibility::Visible &&
		searchBox->FocusState == Windows::UI::Xaml::FocusState::Unfocused && 
		(args->VirtualKey == Windows::System::VirtualKey::Enter))
	{
		int index = shadersList->SelectedIndex;
		if (index != -1)
		{
			auto item = mItems->GetAt(index);
			if (((Controls::ListViewItem^)shadersList->ContainerFromItem(shadersList->SelectedItem))->FocusState != Windows::UI::Xaml::FocusState::Unfocused)
			{
				Platform::String^ id = item->ShaderId;
				std::wstring wid(id->Data());
				PlayShader(std::string(wid.begin(), wid.end()));
			}
		}
	}
	else */if (mRenderer && mPlaying)
	{
		SetKeyState(args->VirtualKey, false);
	}
}


void MainPage::OnPointerEntered(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args)
{
	PointerState state;
	state.bPresented = true;
	state.bPressed = args->CurrentPoint->IsInContact;
	state.x = (int)args->CurrentPoint->Position.X;
	state.y = (int) args->CurrentPoint->Position.Y;

	mInputPointers[args->CurrentPoint->PointerId] = state;
	UpdateMouseState();
}


void MainPage::OnPointerExited(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args)
{
	mInputPointers.erase(args->CurrentPoint->PointerId);
	UpdateMouseState();
}


void MainPage::OnPointerMoved(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args)
{
	mInputPointers[args->CurrentPoint->PointerId].x = (int) args->CurrentPoint->Position.X;
	mInputPointers[args->CurrentPoint->PointerId].y = (int) args->CurrentPoint->Position.Y;
	UpdateMouseState();
}


void MainPage::OnPointerPressed(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args)
{
	mInputPointers[args->CurrentPoint->PointerId].bPressed = true;
	UpdateMouseState();
}


void MainPage::OnPointerReleased(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args)
{
	mInputPointers[args->CurrentPoint->PointerId].bPressed = false;
	UpdateMouseState();
}

void MainPage::UpdateMouseState()
{
	if (!mRenderer)
		return;

	std::map<unsigned int, PointerState> pointers = mInputPointers;

	if (!pointers.size())
	{
		mRenderer->SetMouseState(false, 0, 0, false);
	}
	else
	{
		int x = 0;
		int y = 0;
		bool bPressed = false;

		for (auto iterator = pointers.begin(); iterator != pointers.end(); iterator++)
		{
			// iterator->first = key
			// iterator->second = value

			if (!bPressed || iterator->second.bPressed)
			{
				x = iterator->second.x;
				y = iterator->second.y;
				bPressed = iterator->second.bPressed;
			}
		}

		mRenderer->SetMouseState(true, x, y, bPressed);
	}
}


void MainPage::OnSizeChanged(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::WindowSizeChangedEventArgs ^args)
{

}


void MainPage::ItemsWrapGrid_SizeChanged(Platform::Object^ sender, Windows::UI::Xaml::SizeChangedEventArgs^ e)
{
	ItemsWrapGrid^ wg = (ItemsWrapGrid^) sender;
	double w = wg->ActualWidth;

	if (Windows::System::Profile::AnalyticsInfo::VersionInfo->DeviceFamily == L"Windows.Mobile")
	{
		wg->ItemWidth = w;
	}
	else
	{
		double minW = 360.0f;
		int minNum = (int) (w / minW);
		int minRest = (int) w % (int) minW;
		if (minRest >= minNum)
		{
			minW += minRest / minNum;
		}
		wg->ItemWidth = minW;
	}

	wg->ItemHeight = wg->ItemWidth / 2;
}


void MainPage::OnLayoutMetricsChanged(Windows::ApplicationModel::Core::CoreApplicationViewTitleBar ^sender, Platform::Object ^args)
{
	auto t = buttonFullScreen->Margin;
	t.Right = sender->SystemOverlayRightInset;
	buttonFullScreen->Margin = t;

	t = buttonFullScreen2->Margin;
	t.Right = sender->SystemOverlayRightInset;
	buttonFullScreen2->Margin = t;

	t = logo->Margin;
	t.Left = sender->SystemOverlayLeftInset;
	logo->Margin = t;
}


void MainPage::buttonFullScreen_Click(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e)
{
	ToggleFullscreen();
	if (mPlaying)
	{
		buttonFullScreen->Visibility = Windows::UI::Xaml::Visibility::Collapsed;
		buttonFullScreen2->Visibility = Windows::UI::Xaml::Visibility::Collapsed;
		buttonLicense->Visibility = Windows::UI::Xaml::Visibility::Collapsed;
		buttonLicense2->Visibility = Windows::UI::Xaml::Visibility::Collapsed;
	}
}


void MainPage::OnVisibleBoundsChanged(Windows::UI::ViewManagement::ApplicationView ^sender, Platform::Object ^args)
{
	Windows::ApplicationModel::Core::CoreApplicationViewTitleBar^ coreTitleBar = Windows::ApplicationModel::Core::CoreApplication::GetCurrentView()->TitleBar;
	if (!sender->IsFullScreenMode)
	{
		coreTitleBar->ExtendViewIntoTitleBar = true;
		buttonFullScreen->Visibility = Windows::UI::Xaml::Visibility::Visible;
		buttonFullScreen2->Visibility = Windows::UI::Xaml::Visibility::Visible;
		buttonLicense->Visibility = Windows::UI::Xaml::Visibility::Visible;
		buttonLicense2->Visibility = Windows::UI::Xaml::Visibility::Visible;
	}
}


void MainPage::OnBackRequested(Platform::Object ^sender, Windows::UI::Core::BackRequestedEventArgs ^args)
{
	args->Handled = HandleBack();
}

bool MainPage::HandleBack()
{
	auto deviceFamily = Windows::System::Profile::AnalyticsInfo::VersionInfo->DeviceFamily;

	if (galleryGridHost->Visibility == Windows::UI::Xaml::Visibility::Collapsed)
	{
		if (!mIsXbox && Windows::UI::ViewManagement::ApplicationView::GetForCurrentView()->IsFullScreenMode)
		{
			buttonFullScreen->Visibility = Windows::UI::Xaml::Visibility::Visible;
			buttonFullScreen2->Visibility = Windows::UI::Xaml::Visibility::Visible;
			buttonLicense->Visibility = Windows::UI::Xaml::Visibility::Visible;
			buttonLicense2->Visibility = Windows::UI::Xaml::Visibility::Visible;
			ToggleFullscreen();
		}
		else
		{
			playingButtons->Visibility = Windows::UI::Xaml::Visibility::Collapsed;
			imageBG->Visibility = Windows::UI::Xaml::Visibility::Visible;
			galleryGridHost->Visibility = Windows::UI::Xaml::Visibility::Visible;
			mPlaying = false;
			StopRenderLoop();
			Windows::UI::Core::SystemNavigationManager::GetForCurrentView()->AppViewBackButtonVisibility = Windows::UI::Core::AppViewBackButtonVisibility::Collapsed;
		}

		return true;
	}

	return false;
}

void MainPage::OnGamepadAdded(Platform::Object ^sender, Windows::Gaming::Input::Gamepad ^args)
{
	if(mGamePad == nullptr)
		mGamePad = args;
}


void MainPage::OnGamepadRemoved(Platform::Object ^sender, Windows::Gaming::Input::Gamepad ^args)
{
	if(mGamePad == args)
		mGamePad = nullptr;
}


void MainPage::shadersList_ItemClick(Platform::Object^ sender, Windows::UI::Xaml::Controls::ItemClickEventArgs^ e)
{
	auto item = dynamic_cast<ShaderItem^>(e->ClickedItem);
	if (item && !item->NotSupported)
	{
		Platform::String^ id = item->ShaderId;
		std::wstring wid(id->Data());
		PlayShader(std::string(wid.begin(), wid.end()));
		lastPlayed = item;
	}
}


void MainPage::LicenseButton_Click(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e)
{
	if(mPlaying && lastPlayed)
	{ 
		Windows::UI::Popups::MessageDialog^ dlg = ref new Windows::UI::Popups::MessageDialog(lastPlayed->ShaderInfo, "About this shader");
		dlg->ShowAsync();
	}
	else
	{
		ShowLicense(false);
	}
}


void MainPage::closeButton_Click(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e)
{
	licenseGrid->Visibility = Windows::UI::Xaml::Visibility::Collapsed;
	galleryGridHost->Visibility = Windows::UI::Xaml::Visibility::Visible;
}


void MainPage::buttonAccept_Click(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e)
{
	licenseGrid->Visibility = Windows::UI::Xaml::Visibility::Collapsed;
	Windows::Storage::ApplicationData::Current->RoamingSettings->Values->Insert("LicenseAccepted", "yes");
	galleryGridHost->Visibility = Windows::UI::Xaml::Visibility::Visible;
}


void MainPage::buttonDecline_Click(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e)
{
	App::Current->Exit();
}

void MainPage::ShowLicense(bool firstTime)
{
	galleryGridHost->Visibility = Windows::UI::Xaml::Visibility::Collapsed;
	licenseGrid->Visibility = Windows::UI::Xaml::Visibility::Visible;
	licenseButtons->Visibility = firstTime ? Windows::UI::Xaml::Visibility::Visible : Windows::UI::Xaml::Visibility::Collapsed;
	closeButton->Visibility = firstTime ? Windows::UI::Xaml::Visibility::Collapsed : Windows::UI::Xaml::Visibility::Visible;
	
	(firstTime ? buttonAccept : closeButton)->Focus(Windows::UI::Xaml::FocusState::Keyboard);
}
