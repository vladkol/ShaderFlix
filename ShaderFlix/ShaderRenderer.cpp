//
// This file is used by the template to render a basic scene using GL.
//

#include "pch.h"
#include "ShaderRenderer.h"
#include "Utils.h"
#include <sstream>

using namespace Platform;
using namespace Windows::UI::Core;
using namespace Windows::System;

const float Vertices [] = {
	1, -1, 0,
	1,  1, 0,
	-1,  1, 0,
	-1, -1, 0
};

const GLubyte Indices [] = {
	0, 1, 2,
	2, 3, 0
};


// https://github.com/beautypi/ShaderFlix-iOS-v2/

//static const char *shader_header =
//	"#extension GL_EXT_shader_texture_lod : enable \n"
//	"#extension GL_OES_standard_derivatives : enable \n"
//	"precision highp float;\n"
//	"precision highp int;\n\n"
//	"precision mediump sampler2D;\n\n"
//	"uniform vec2  ifFragCoordOffsetUniform;\n"
//	"uniform vec3  iResolution;\n"
//	"uniform float iGlobalTime;\n"
//	"uniform float iTimeDelta;\n"
//	"uniform int   iFrame;\n"
//	"uniform float iChannelTime[4];\n"
//	"uniform vec3  iChannelResolution[4];\n"
//	"uniform vec4  iMouse;\n"
//	"uniform sampler%s iChannel0;\n"
//	"uniform sampler%s iChannel1;\n"
//	"uniform sampler%s iChannel2;\n"
//	"uniform sampler%s iChannel3;\n"
//	"uniform vec4  iDate;\n"
//	"uniform float iSampleRate;\n\n";

static const char *shader_header =
"#extension GL_EXT_shader_texture_lod : enable \n"
"#extension GL_OES_standard_derivatives : enable \n"
"precision highp float;\n"
"precision highp int;\n"
"precision mediump sampler2D;\n\n"
"//precision highp samplerCube;\n\n"
"uniform vec2      ifFragCoordOffsetUniform;\n"
"uniform vec3      iResolution;\n"           // viewport resolution (in pixels)
"uniform float     iGlobalTime;\n"           // shader playback time (in seconds)
"uniform float     iTimeDelta;\n"            // render time (in seconds)
"uniform int       iFrame;\n"                // shader playback frame
"uniform float     iChannelTime[4];\n"       // channel playback time (in seconds)
"uniform vec3      iChannelResolution[4];\n" // channel resolution (in pixels)
"uniform vec4      iMouse;\n"                // mouse pixel coords. xy: current (if MLB down), zw: click        
"uniform sampler%s iChannel0;\n"			 // input channel0. %s = 2D/Cube
"uniform sampler%s iChannel1;\n"			 // input channel1. %s = 2D/Cube
"uniform sampler%s iChannel2;\n"			 // input channel2. %s = 2D/Cube
"uniform sampler%s iChannel3;\n"			 // input channel3. %s = 2D/Cube
"uniform vec4      iDate;\n"                 // (year, month, day, time in seconds)
"uniform float     iSampleRate;\n\n";           // sound sample rate (i.e., 44100)

ShaderRenderer::ShaderRenderer() :
	mWindowWidth(0),
	mWindowHeight(0), 
	mStarted(false), 
	mLoaded(false), 
	mFrame(0), 
	mShaderProg(0), 
	mShaderReady(false)
{
	mTimer.reset(CreateTimer());
	memset(mKeyboardState, 0, sizeof(char) * 256 * 3);
	memset(&variables, 0, sizeof(variables));

	mTextures[0] = new Texture();
	mTextures[1] = new Texture();
	mTextures[2] = new Texture();
	mTextures[3] = new Texture();
}

ShaderRenderer::~ShaderRenderer()
{
	glViewport(0, 0, static_cast<int>(mWindowWidth), static_cast<int>(mWindowHeight));
	glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
	glClear(GL_COLOR_BUFFER_BIT);
}


// https://www.shadertoy.com/view/ldfGWn
// https://github.com/beautypi/ShaderFlix-iOS-v2/blob/a852d8fd536e0606377a810635c5b654abbee623/ShaderFlix/ShaderPassRenderer.m
// https://www.shadertoy.com/api/v1/shaders/lsXGzf?key=rtHtwn 
// https://github.com/jherico/qtvr/blob/master/app/src/ShaderFlix/Renderer.cpp

void ShaderRenderer::Draw()
{
	glViewport(0, 0, static_cast<int>(mWindowWidth), static_cast<int>(mWindowHeight));
	glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
	glClear(GL_COLOR_BUFFER_BIT);
	assert(glGetError() == GL_NO_ERROR);

	if (!mShaderReady)
		return;

	if (!mStarted)
	{
		mStarted = true;

		memset(mKeyboardState, 0, sizeof(char) * 256 * 3);
		mFrame = 0;
		mTimer.reset(CreateTimer());
		mTimer->start();
	}

	glUseProgram(mShaderProg);
	assert(glGetError() == GL_NO_ERROR);

	int tunit = 0;
	for (int i = 0; (i < 4 && i < (int) mShader.imagePass.inputs.size()); i++)
	{
		/*if (mShader.imagePass.inputs[i].ctype == "keyboard")
		{

		}*/
		if (mTextures[i]->id)
		{
			glActiveTexture(GL_TEXTURE0 + tunit);
			glBindTexture(mTextures[i]->targ, mTextures[i]->id);
			glUniform1i(variables.sampler[i], tunit);
			tunit++;
		}
	}
	assert(glGetError() == GL_NO_ERROR);

	// set uniforms
	float deltaTime = static_cast<float>(mTimer->getDeltaTime());
	float elapsedTime = static_cast<float>(mTimer->getElapsedTime());
	if (elapsedTime < 0.0001f)
		elapsedTime = 0.0f;

	tm tm = mTimer->tm_now();

	glUniform3f(variables.resolution, (float)mWindowWidth, (float)mWindowHeight, 1.0f);
	glUniform1i(variables.frame, mFrame++);
	assert(glGetError() == GL_NO_ERROR);

	glUniform1f(variables.globaltime, elapsedTime);
	glUniform1f(variables.timedelta, deltaTime);

	for (int i = 0; i < 4; i++)
	{
		glUniform1f(variables.channeltime[i], elapsedTime);
		glUniform3f(variables.channelres[i], 
			mTextures[i]->w, mTextures[i]->h, 1.0f);
	}

	if(click_x > -1)
		glUniform4f(variables.mouse, mouse_x, mouse_y, click_x, click_y);

	glUniform4f(variables.date, tm.tm_year, tm.tm_mon, tm.tm_mday,
		tm.tm_sec + tm.tm_min * 60 + tm.tm_hour * 3600);
	glUniform1f(variables.samplerate, 0);

	if (variables.devicerotationuniform > 0)
	{

	}

	float zeros2[2] = { 0, 0 };
	glUniform2fv(variables.fragcoordoffsetuniform, 1, zeros2);

	assert(glGetError() == GL_NO_ERROR);

	glEnableVertexAttribArray(mPositionSlot);
	glVertexAttribPointer(mPositionSlot, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (const GLvoid *) 0);

	glBindVertexArrayOES(mVertexArray);
	glDrawElements(GL_TRIANGLES, sizeof(Indices) / sizeof(Indices[0]), GL_UNSIGNED_BYTE, 0);
}

void ShaderRenderer::UpdateWindowSize(GLsizei width, GLsizei height)
{
	mWindowWidth = width;
	mWindowHeight = height;
	glViewport(0, 0, static_cast<int>(mWindowWidth), static_cast<int>(mWindowHeight));
}

void ShaderRenderer::BakeShader()
{
	// all crazy loading stuff here 
	for (int i = 0; i < 4; i++)
	{
		if (mShader.imagePass.inputs.size() <= i)
			break;

		if (mShader.imagePass.inputs[i].ctype == "keyboard")
		{
			mTextures[i] = create_keyboard_texture();
		}
		else if (mShader.imagePass.inputs[i].ctype == "cubemap")
		{
			auto input = mShader.imagePass.inputs[i];
			mTextures[i] = load_cubemap(input.chachedSourceFiles,
				input.sampler.wrap, input.sampler.filter,
				input.sampler.srgb == "true",
				input.sampler.vflip == "true");
		}
		else if (mShader.imagePass.inputs[i].ctype == "texture")
		{
			auto input = mShader.imagePass.inputs[i];
			mTextures[i] = load_texture(input.chachedSourceFiles[0].c_str(),
				input.sampler.wrap, input.sampler.filter,
				input.sampler.srgb == "true",
				input.sampler.vflip == "true");
		}
	}

	GLuint VertexShaderID = glCreateShader(GL_VERTEX_SHADER);
	GLuint FragmentShaderID = glCreateShader(GL_FRAGMENT_SHADER);

	const char* VertexSourcePointer = main_vertex_code();
	glShaderSource(VertexShaderID, 1, &VertexSourcePointer, NULL);
	glCompileShader(VertexShaderID);
	assert(glGetError() == GL_NO_ERROR);

	std::ostringstream shaderCode;

	shaderCode << format(shader_header,
		mTextures[0]->stype.c_str(),
		mTextures[1]->stype.c_str(),
		mTextures[2]->stype.c_str(),
		mTextures[3]->stype.c_str());

	shaderCode << mShader.imagePass.code << "\n\n";
	shaderCode << main_fragment_code() << "\n";

	std::string shaderCodeStr = shaderCode.str();

	//shaderCodeStr = string_replace(shaderCodeStr, "textureCube", "_textureCube");

	const char*  FragmentSourcePointer = shaderCodeStr.c_str();

	glShaderSource(FragmentShaderID, 1, &FragmentSourcePointer, NULL);
	assert(glGetError() == GL_NO_ERROR);
	glCompileShader(FragmentShaderID);
	assert(glGetError() == GL_NO_ERROR);

	GLuint programId = glCreateProgram();
	glAttachShader(programId, VertexShaderID);
	glAttachShader(programId, FragmentShaderID);
	
	//glBindAttribLocation(programId, 0, "position");
	//mPositionSlot = 0;
	
	glLinkProgram(programId);
	assert(glGetError() == GL_NO_ERROR);

	glDeleteShader(VertexShaderID);
	glDeleteShader(FragmentShaderID);

	mShaderProg = programId;

	//glUseProgram(mShaderProg);
	//assert(glGetError() == GL_NO_ERROR);

	mPositionSlot = glGetAttribLocation(mShaderProg, "position");
	//if (mPositionSlot == -1)
	//	mPositionSlot = 0;

	variables.resolution = glGetUniformLocation(mShaderProg, "iResolution");
	variables.globaltime = glGetUniformLocation(mShaderProg, "iGlobalTime");
	variables.timedelta = glGetUniformLocation(mShaderProg, "iTimeDelta");
	variables.frame = glGetUniformLocation(mShaderProg, "iFrame");
	assert(glGetError() == GL_NO_ERROR);

	for (int i = 0; i<4; i++) 
	{
		char buf[64];
		sprintf(buf, "iChannelTime[%d]", i);
		variables.channeltime[i] = glGetUniformLocation(mShaderProg, buf);
	}
	assert(glGetError() == GL_NO_ERROR);

	for (int i = 0; i<4; i++)
	{
		char buf[64];
		sprintf(buf, "iChannelResolution[%d]", i);
		variables.channelres[i] = glGetUniformLocation(mShaderProg, buf);
	}
	assert(glGetError() == GL_NO_ERROR);

	variables.mouse = glGetUniformLocation(mShaderProg, "iMouse");

	for (int i = 0; i<4; i++)
	{
		char buf[64];
		sprintf(buf, "iChannel%d", i);
		variables.sampler[i] = glGetUniformLocation(mShaderProg, buf);
	}
	assert(glGetError() == GL_NO_ERROR);

	variables.date = glGetUniformLocation(mShaderProg, "iDate");
	variables.samplerate = glGetUniformLocation(mShaderProg, "iSampleRate");
	assert(glGetError() == GL_NO_ERROR);

	variables.fragcoordoffsetuniform = glGetUniformLocation(mShaderProg, "ifFragCoordOffsetUniform");
	variables.devicerotationuniform = glGetUniformLocation(mShaderProg, "iDeviceRotationUniform");
	
	assert(glGetError() == GL_NO_ERROR);

	InitVertexBuffer();
	mShaderReady = true;
}

void ShaderRenderer::InitVertexBuffer()
{
	glGenVertexArraysOES(1, &mVertexArray);
	glBindVertexArrayOES(mVertexArray);

	glGenBuffers(1, &mVertexBuffer);
	glBindBuffer(GL_ARRAY_BUFFER, mVertexBuffer);
	glBufferData(GL_ARRAY_BUFFER, sizeof(Vertices), Vertices, GL_STATIC_DRAW);

	glGenBuffers(1, &mIndexBuffer);
	glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, mIndexBuffer);
	glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof(Indices), Indices, GL_STATIC_DRAW);

	glBindVertexArrayOES(0);
	assert(glGetError() == GL_NO_ERROR);
}