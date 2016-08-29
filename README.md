# ShaderFlix
[ShaderToy.com](https://shadertoy.com) Player for Windows 10.  
Browse shaders from Shadertoy.com on your device and enjoy great visual experiences. Shadertoy is a platform where developers can prototype, experiment, teach, learn, inspire and share visual creations with the community. 

It is a C++ port of [ShaderToy iOS app](https://github.com/beautypi/shadertoy-iOS-v2). Well, not quate a port, but inspired by that official app. While it is a Windows 10 UWP application, pretty much everything but UI is portable C++ code. 
Currently, it doesn't support multipass shaders. Shaders with webcam, video and audio input are supported, but don't receive real input data. Overall, the source code requires a lot of refactoring which is a part of ongoing multipass support development. 

To build this app, you need Visual Studio 2015 Update 3 or later, with latest Universal Windows Platform SDK. 
IT uses [Project "ANGLE"](https://github.com/Microsoft/angle) as OpenGL ES layer, libcURL for networking, rapidJSON for JSON parsing. Feel free to make derivatives on Windows and other platforms. **Pull requests with great improvements are very welcome!** 

![screenshot](https://cloud.githubusercontent.com/assets/4735184/18058010/4232e16e-6dc7-11e6-8d36-5ce909c6edaa.png)

If not specified, all the app content, is licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License](https://creativecommons.org/licenses/by-nc-sa/3.0/deed.en_US). 

Copyright © 2016 Vlad Kolesnikov

Shaderflix app background based on "Voronoi - distances" shader by Inigo Quilez (CC BY-NC-SA 3.0 US license)

RapidJSON, Copyright © 2015 THL A29 Limited, a Tencent company, and Milo Yip.  All rights reserved.

libcURL, Copyright © 1996 - 2016, Daniel Stenberg, daniel@haxx.se, and other contributors. 

OpenGL ES implementation via ANGLE, Copyright © 2002-2013 The ANGLE Project Authors, Portions Copyright © Microsoft Corporation

![another screenshot](https://cloud.githubusercontent.com/assets/4735184/18058056/7b42c10e-6dc7-11e6-8ef2-b1903e2c30bd.png)
*[Truchet Tentacles by WAHa_06x36](https://www.shadertoy.com/view/ldfGWn)*
