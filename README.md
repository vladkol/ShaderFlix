# ShaderFlix
ShaderToy.com Player for Windows 10 
Browse shaders from Shadertoy.com on your device and enjoy great visual experiences. 

It is a C++ port of [ShaderToy iOS app](https://github.com/beautypi/shadertoy-iOS-v2). While it is a Windows 10 UWP app, pretty much everything but UI is portable C++ code. 
Currently, it doesn't support multipass shaders. Shaders with webcam, video and audio input are supported, but don't receive real input data. 

To build this app, you need Visual Studio 2015 Update 3 or later, with latest Universal Windows Platform SDK. 
IT uses Project "ANGLE" for OpenGL ES layer, libcURL for networking, rapidJSON for JSON parsing. Feel free to make derivatives on Windows and other platforms. 

All the app content, if not specified, is licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License](https://creativecommons.org/licenses/by-nc-sa/3.0/deed.en_US). 

Copyright © 2016 Vlad Kolesnikov

Shaderflix app background based on "Voronoi - distances" shader by Inigo Quilez (CC BY-NC-SA 3.0 US license)

RapidJSON, Copyright © 2015 THL A29 Limited, a Tencent company, and Milo Yip.  All rights reserved.

libcURL, Copyright © 1996 - 2016, Daniel Stenberg, daniel@haxx.se, and other contributors. 

OpenGL ES implementation via ANGLE, Copyright © 2002-2013 The ANGLE Project Authors, Portions Copyright © Microsoft Corporation

