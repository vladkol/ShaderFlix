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

using namespace ShaderToy;

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
	mItems = ref new Platform::Collections::Vector<ShaderItem^>();

	InitializeComponent();

	//mShaderToyId = "ldfGWn"; // "Truchet Tentacles"  https://www.shadertoy.com/view/ldfGWn

	mOpenGLES = new OpenGLES();

	Windows::UI::Core::CoreWindow^ window = Windows::UI::Xaml::Window::Current->CoreWindow;

	window->VisibilityChanged +=
		ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow^, Windows::UI::Core::VisibilityChangedEventArgs^>(this, &MainPage::OnVisibilityChanged);

	this->Loaded +=
		ref new Windows::UI::Xaml::RoutedEventHandler(this, &MainPage::OnPageLoaded);

	window->KeyDown += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::KeyEventArgs ^>(this, &MainPage::OnKeyDown);
	window->KeyUp += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::KeyEventArgs ^>(this, &MainPage::OnKeyUp);
	window->PointerEntered += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::PointerEventArgs ^>(this, &MainPage::OnPointerEntered);
	window->PointerExited += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::PointerEventArgs ^>(this, &MainPage::OnPointerExited);
	window->PointerMoved += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::PointerEventArgs ^>(this, &MainPage::OnPointerMoved);
	window->PointerPressed += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::PointerEventArgs ^>(this, &MainPage::OnPointerPressed);
	window->PointerReleased += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::PointerEventArgs ^>(this, &MainPage::OnPointerReleased);

	window->SizeChanged += ref new Windows::Foundation::TypedEventHandler<Windows::UI::Core::CoreWindow ^, Windows::UI::Core::WindowSizeChangedEventArgs ^>(this, &MainPage::OnSizeChanged);

	Windows::UI::ViewManagement::ApplicationViewTitleBar^ formattableTitleBar = Windows::UI::ViewManagement::ApplicationView::GetForCurrentView()->TitleBar;
	formattableTitleBar->BackgroundColor = Windows::UI::Colors::Transparent;
	formattableTitleBar->ButtonBackgroundColor = Windows::UI::Colors::Transparent;

	Windows::ApplicationModel::Core::CoreApplicationViewTitleBar^ coreTitleBar = Windows::ApplicationModel::Core::CoreApplication::GetCurrentView()->TitleBar;
	coreTitleBar->LayoutMetricsChanged += ref new Windows::Foundation::TypedEventHandler<Windows::ApplicationModel::Core::CoreApplicationViewTitleBar ^, Platform::Object ^>(this, &MainPage::OnLayoutMetricsChanged);
	coreTitleBar->ExtendViewIntoTitleBar = true;
	Windows::UI::Xaml::Window::Current->SetTitleBar(titleBar);

	FetchQuery();
}

void MainPage::OnPageLoaded(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e)
{
	// The SwapChainPanel has been created and arranged in the page layout, so EGL can be initialized.
	CreateRenderSurface();
	logo->Height = searchBox->ActualHeight-2;
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

		float w = (float)swapchain->ActualWidth;
		float h = (float)swapchain->ActualHeight;
		float tw = 1920;
		float th = tw * h / w;

		Size customRenderSurfaceSize = Size(tw, th);
		mRenderSurface = mOpenGLES->CreateSurface(swapchain, &customRenderSurfaceSize, nullptr);

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

	// Create a task for rendering that will be run on a background thread.
	auto workItemHandler = ref new Windows::System::Threading::WorkItemHandler([this](Windows::Foundation::IAsyncAction ^ action)
	{
		Concurrency::critical_section::scoped_lock lock(mRenderSurfaceCriticalSection);

		mOpenGLES->MakeCurrent(mRenderSurface);

		if (mRenderer.get() == nullptr)
		{
			EGLint panelWidth = 0;
			EGLint panelHeight = 0;
			mOpenGLES->GetSurfaceDimensions(mRenderSurface, &panelWidth, &panelHeight);

			mRenderer = std::make_shared<ShaderRenderer>();
			mRenderer->UpdateWindowSize(panelWidth, panelHeight);
			mRenderer->InitShader(APP_KEY, mShaderToyId.c_str());
		}

		bool bFirstFrameDone = false;

		while (action->Status == Windows::Foundation::AsyncStatus::Started)
		{
			EGLint panelWidth = 0;
			EGLint panelHeight = 0;
			mOpenGLES->GetSurfaceDimensions(mRenderSurface, &panelWidth, &panelHeight);

			// Logic to update the scene could go here
			mRenderer->UpdateWindowSize(panelWidth, panelHeight);
			mRenderer->Draw();

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

			if (!bFirstFrameDone)
			{
				bFirstFrameDone = true;

				swapchain->Dispatcher->RunAsync(Windows::UI::Core::CoreDispatcherPriority::High, ref new Windows::UI::Core::DispatchedHandler([=]()
				{
					progressPreRender->IsActive = false;
					imageBG->Visibility = Windows::UI::Xaml::Visibility::Collapsed;
				}, CallbackContext::Any));
			}
		}

		mRenderer.reset();
	});

	// Run task on a dedicated high priority background thread.
	mRenderLoopWorker = Windows::System::Threading::ThreadPool::RunAsync(workItemHandler, Windows::System::Threading::WorkItemPriority::High, Windows::System::Threading::WorkItemOptions::TimeSliced);
}

void MainPage::StopRenderLoop()
{
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
}


void MainPage::Shader_Tapped(Platform::Object^ sender, Windows::UI::Xaml::Input::TappedRoutedEventArgs^ e)
{
	Platform::String^ id = ((FrameworkElement^) sender)->Tag->ToString();
	std::wstring wid(id->Data());
	PlayShader(std::string(wid.begin(), wid.end()));
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

					for (unsigned int i = 0; (i < items.Size() && i < 100); i++)
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
		if (!docShader.HasParseError() && docShader.HasMember("Shader"))
		{
			const rapidjson::Value& shader = docShader["Shader"];
			const rapidjson::Value& info = shader["info"];
			name = info["name"].GetString();
		}
		else
		{
			HTTPDownloader::DeleteCacheItem(shaderUrl.str().c_str());
		}
			
		std::wstring wname(name.begin(), name.end());

		swapchain->Dispatcher->RunAsync(Windows::UI::Core::CoreDispatcherPriority::High, ref new Windows::UI::Core::DispatchedHandler([=]()
		{
			item->ShaderName = ref new Platform::String(wname.c_str());
			mItems->SetAt(index, item);
		}, CallbackContext::Any));
	});
}


void MainPage::PlayShader(const std::string& id)
{
	StopRenderLoop();
	mPlaying = false;

	mShaderToyId = id;
	
	if (mShaderToyId.length() > 0)
	{
		try
		{
			progressPreRender->IsActive = true;
			galleryGridHost->Visibility = Windows::UI::Xaml::Visibility::Collapsed;
			
			StartRenderLoop();
			mPlaying = true;
		}
		catch (...)
		{
			assert(!"Cannot play!");
		}
	}
}






void MainPage::OnKeyDown(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::KeyEventArgs ^args)
{
	if (args->VirtualKey == Windows::System::VirtualKey::Escape ||
		args->VirtualKey == Windows::System::VirtualKey::Back ||
		args->VirtualKey == Windows::System::VirtualKey::GamepadB)
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
		args->VirtualKey == Windows::System::VirtualKey::GamepadB)
	{
		if (galleryGridHost->Visibility == Windows::UI::Xaml::Visibility::Collapsed)
		{
			imageBG->Visibility = Windows::UI::Xaml::Visibility::Visible;
			galleryGridHost->Visibility = Windows::UI::Xaml::Visibility::Visible;
			mPlaying = false;
			StopRenderLoop();
		}
		return;
	}

	if (galleryGridHost->Visibility == Windows::UI::Xaml::Visibility::Visible &&
		(args->VirtualKey == Windows::System::VirtualKey::Enter ||
			args->VirtualKey == Windows::System::VirtualKey::GamepadA))
	{
		int index = shadersList->SelectedIndex;
		if (index != -1)
		{
			auto item = mItems->GetAt(index);
			Platform::String^ id = item->ShaderId;
			std::wstring wid(id->Data());
			PlayShader(std::string(wid.begin(), wid.end()));
		}
	}
	else if (mRenderer && mPlaying)
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
	auto t = searchBox->Margin;
	t.Right = sender->SystemOverlayRightInset;
	searchBox->Margin = t;
}
