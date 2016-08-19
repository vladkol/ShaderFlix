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

namespace ShaderToy
{
	[Windows::UI::Xaml::Data::Bindable]
	public ref class ShaderItem sealed
	{
	public:
		property Platform::String^ ShaderPreview;
		property Platform::String^ ShaderName;
		property Platform::String^ ShaderId;
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
		std::string mShaderToyId;
		bool mPlaying;

		std::map<unsigned int, PointerState> mInputPointers;
		void UpdateMouseState();

		void searchBox_QuerySubmitted(Windows::UI::Xaml::Controls::SearchBox^ sender, Windows::UI::Xaml::Controls::SearchBoxQuerySubmittedEventArgs^ args);
		void Shader_Tapped(Platform::Object^ sender, Windows::UI::Xaml::Input::TappedRoutedEventArgs^ e);
		void shadersList_ContainerContentChanging(Windows::UI::Xaml::Controls::ListViewBase^ sender, Windows::UI::Xaml::Controls::ContainerContentChangingEventArgs^ args);

		void OnKeyDown(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::KeyEventArgs ^args);
		void OnKeyUp(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::KeyEventArgs ^args);
		void OnPointerEntered(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args);
		void OnPointerExited(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args);
		void OnPointerMoved(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args);
		void OnPointerPressed(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args);
		void OnPointerReleased(Windows::UI::Core::CoreWindow ^sender, Windows::UI::Core::PointerEventArgs ^args);
	};
}
