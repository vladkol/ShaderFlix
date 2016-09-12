# ShaderFlix
[ShaderToy.com](https://shadertoy.com) Player for Windows 10, aimed to be portable across Windows/macOS/iOS/Android.  
Browse shaders from Shadertoy.com on your device and enjoy great visual experiences. Shadertoy is a platform where developers can prototype, experiment, teach, learn, inspire and share visual creations with the community. 

It is a C++ port of [ShaderToy iOS app](https://github.com/beautypi/shadertoy-iOS-v2). Well, not quate a port, but inspired by that official app. First version a Windows 10 UWP application, pretty much everything but UI is portable C++ code. This is just the beggining. The idea is to keep the code as portable as possible across Windows, macOS, iOS and Android. Now working on a new version of the UI layer using [React Native](https://facebook.github.io/react-native/), keeping the renderer in C++.

Try Shaderflix [from Windows Store](https://www.microsoft.com/store/apps/9NBLGGH520JS).
It also works on Xbox One! 
<a href="https://www.microsoft.com/store/apps/9NBLGGH520JS?ocid=badge" target="_blank">
<img src="https://assets.windowsphone.com/f2f77ec7-9ba9-4850-9ebe-77e366d08adc/English_Get_it_Win_10_InvariantCulture_Default.png" alt="Get it on Windows 10" width="256px"></a>

Currently, Shaderflix doesn't support multipass shaders. Shaders with webcam, video and audio input are supported, but don't receive real input data. Overall, the source code requires a lot of refactoring which is a part of ongoing multipass support development. 

To build this app, you need Visual Studio 2015 Update 3 or later, with latest Universal Windows Platform SDK. 
It uses [Project "ANGLE"](https://github.com/Microsoft/angle) as OpenGL ES layer on Windows, [libcURL](https://curl.haxx.se/libcurl/) for networking, [rapidJSON](http://rapidjson.org/) for JSON parsing, [stb image](https://github.com/nothings/stb) for loading textures. **You may need to regenerate certificate file (last tab in Package.appxmanifest file editor).** 

Feel free to make derivatives on Windows and other platforms. **Pull requests with great improvements are very welcome!** 

![screenshot](https://cloud.githubusercontent.com/assets/4735184/18217925/5b469394-7114-11e6-8461-067c715facc8.png)

If not specified, all the app content, is licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License](https://creativecommons.org/licenses/by-nc-sa/3.0/deed.en_US). 

Copyright © 2016 Vlad Kolesnikov

Shaderflix app background based on "Voronoi - distances" shader by Inigo Quilez (CC BY-NC-SA 3.0 US license)

RapidJSON, Copyright © 2015 THL A29 Limited, a Tencent company, and Milo Yip.  All rights reserved.

libcURL, Copyright © 1996 - 2016, Daniel Stenberg, daniel@haxx.se, and other contributors. 

OpenGL ES implementation via ANGLE, Copyright © 2002-2013 The ANGLE Project Authors, Portions Copyright © Microsoft Corporation

![another screenshot](https://cloud.githubusercontent.com/assets/4735184/18217935/74e140ec-7114-11e6-9cb4-afc4c0ccaf9a.png)
*Main View Screenshot*
