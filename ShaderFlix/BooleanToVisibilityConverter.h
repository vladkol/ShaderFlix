#pragma once


namespace ShaderFlix
{
	public ref class BooleanToVisibilityConverter sealed : Windows::UI::Xaml::Data::IValueConverter
	{
	public:


		virtual Platform::Object^ Convert(Platform::Object^ value, Windows::UI::Xaml::Interop::TypeName targetType,
			Platform::Object^ parameter, Platform::String^ language)
		{
			(void) targetType;
			(void) parameter;
			(void) language;

			auto boxedBool = dynamic_cast<Platform::Box<bool>^>(value);
			auto boolValue = (boxedBool != nullptr && boxedBool->Value);
			return (boolValue ? Windows::UI::Xaml::Visibility::Visible : Windows::UI::Xaml::Visibility::Collapsed);
		}

		// No need to implement converting back on a one-way binding 
		virtual Platform::Object^ ConvertBack(Platform::Object^ value, Windows::UI::Xaml::Interop::TypeName targetType,
			Platform::Object^ parameter, Platform::String^ language)
		{
			(void) targetType;
			(void) parameter;
			(void) language;

			auto visibility = dynamic_cast<Platform::Box<Windows::UI::Xaml::Visibility>^>(value);
			return (visibility != nullptr && visibility->Value == Windows::UI::Xaml::Visibility::Visible);
		}

	};
}

