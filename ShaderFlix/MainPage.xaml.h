//
// MainPage.xaml.h
// Declaration of the MainPage class.
//

#pragma once

#include "MainPage.g.h"
#include "OpenGLES.h"
#include "ShaderRenderer.h"

#include <concrt.h>
#include <map>

#define APP_KEY "rtHtwn"

namespace ShaderFlix
{
	[Windows::UI::Xaml::Data::Bindable]
	public ref class ShaderItem sealed
	{
	public:
		property Platform::String^ ShaderPreview;
		property Platform::String^ ShaderName;
		property Platform::String^ ShaderId;
		property Platform::String^ ShaderLikes;
		property bool NotSupported;
		property Platform::String^ ShaderInfo;

		ShaderItem()
		{
			NotSupported = false;
		}
	};

	struct PointerState
	{
		bool bPresented;
		bool bPressed;
		int x;
		int y;

		PointerState() : 
			bPresented(false), bPressed(false), x(0), y(0)
		{}
	};

	/// <summary>
	/// An empty page that can be used on its own or navigated to within a Frame.
	/// </summary>
	public ref class MainPage sealed
	{
	public:
		MainPage();
		virtual ~MainPage()
		{
			if (mOpenGLES)
			{
				delete mOpenGLES;
				mOpenGLES = nullptr;
			}
		}

	internal:
		property Platform::Collections::Vector<ShaderItem^>^ mItems;
		property ShaderItem^ lastPlayed;

	private:

		void OnPageLoaded(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e);
		void OnVisibilityChanged(Windows::UI::Core::CoreWindow^ sender, Windows::UI::Core::VisibilityChangedEventArgs^ args);

		void CreateRenderSurface();
		void DestroyRenderSurface();
		void RecoverFromLostDevice();
		void StartRenderLoop();
		void StopRenderLoop();
		
		OpenGLES* mOpenGLES;
		EGLSurface mRenderSurface;     // This surface is associated with a swapChainPanel on the page
		Concurrency::critical_section mRenderSurfaceCriticalSection;
		Windows::Foundation::IAsyncAction^ mRenderLoopWorker;

		void FetchQuery();
		void PlayShader(const std::string& id);
		void SetKeyState(Windows::System::VirtualKey key, bool pressed);

		std::shared_ptr<ShaderRenderer> mRenderer;
		std::string mShaderFlixId;
		bool mPlaying;
		bool mIsXbox;
		Windows::Gaming::Input::Gamepad^ mGamePad;
		Windows::Media::Playback::MediaPlayer^ mPlayer;

		std::mutex http_mutex;             // mutex for critical section
		std::condition_variable http_cv; // condition variable for critical section  
		unsigned int http_number;

		Windows::UI::Color mDefTitleButtonColor, mDefTitleColor;

		std::map<unsigned int, PointerState> mInputPointers;
		void UpdateMouseState();

		void ToggleFullscreen();
		bool HandleBack();
		void ShowLicense(bool firstTime);
		void UpdateWebPlayerSize();

		void searchBox_QuerySubmitted(Windows::UI::Xaml::Controls::SearchBox^ sender, Windows::UI::Xaml::Controls::SearchBoxQuerySubmittedEventArgs^ args);
		void shadersList_ContainerContentChanging(Windows::UI::Xaml::Controls::ListViewBase^ sender, Windows::UI::Xaml::Controls::ContainerContentChangingEventArgs^ args);

		void OnKeyDown(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::KeyEventArgs ^args);
		void OnKeyUp(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::KeyEventArgs ^args);
		void OnPointerEntered(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args);
		void OnPointerExited(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args);
		void OnPointerMoved(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args);
		void OnPointerPressed(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args);
		void OnPointerReleased(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args);
		void OnSizeChanged(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::WindowSizeChangedEventArgs ^args);
		void ItemsWrapGrid_SizeChanged(Platform::Object^ sender, Windows::UI::Xaml::SizeChangedEventArgs^ e);
		void OnLayoutMetricsChanged(Windows::ApplicationModel::Core::CoreApplicationViewTitleBar ^sender, Platform::Object ^args);
		void buttonFullScreen_Click(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e);
		void OnVisibleBoundsChanged(Windows::UI::ViewManagement::ApplicationView ^sender, Platform::Object ^args);
		void OnBackRequested(Platform::Object ^sender, Windows::UI::Core::BackRequestedEventArgs ^args);
		void OnGamepadAdded(Platform::Object ^sender, Windows::Gaming::Input::Gamepad ^args);
		void OnGamepadRemoved(Platform::Object ^sender, Windows::Gaming::Input::Gamepad ^args);
		void shadersList_ItemClick(Platform::Object^ sender, Windows::UI::Xaml::Controls::ItemClickEventArgs^ e);
		void LicenseButton_Click(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e);
		void closeButton_Click(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e);
		void buttonAccept_Click(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e);
		void buttonDecline_Click(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e);
		void buttonBack_Click(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e);
		void buttonForward_Click(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e);
		void buttonCloseWeb_Click(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e);
		void web_NavigationCompleted(Windows::UI::Xaml::Controls::WebView^ sender, Windows::UI::Xaml::Controls::WebViewNavigationCompletedEventArgs^ args);
		void web_NavigationStarting(Windows::UI::Xaml::Controls::WebView^ sender, Windows::UI::Xaml::Controls::WebViewNavigationStartingEventArgs^ args);
		void buttonMusic_Click(Platform::Object^ sender, Windows::UI::Xaml::RoutedEventArgs^ e);
		void web_ContentLoading(Windows::UI::Xaml::Controls::WebView^ sender, Windows::UI::Xaml::Controls::WebViewContentLoadingEventArgs^ args);
		void OnNewWindowRequested(Windows::UI::Xaml::Controls::WebView ^sender, Windows::UI::Xaml::Controls::WebViewNewWindowRequestedEventArgs ^args);
	};
}
