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


// https://github.com/beautypi/shadertoy-iOS-v2/

static const char *shader_header =
	"#extension GL_EXT_shader_texture_lod : enable \n"
	"#extension GL_OES_standard_derivatives : enable \n"
	"precision highp float;\n"
	"precision highp int;\n\n"
	"precision mediump sampler2D;\n\n"
	"uniform vec2  ifFragCoordOffsetUniform;\n"
	"uniform vec3  iResolution;\n"
	"uniform float iGlobalTime;\n"
	"uniform float iTimeDelta;\n"
	"uniform int   iFrame;\n"
	"uniform float iChannelTime[4];\n"
	"uniform vec3  iChannelResolution[4];\n"
	"uniform vec4  iMouse;\n"
	"uniform sampler%s iChannel0;\n"
	"uniform sampler%s iChannel1;\n"
	"uniform sampler%s iChannel2;\n"
	"uniform sampler%s iChannel3;\n"
	"uniform vec4  iDate;\n"
	"uniform float iSampleRate;\n\n";

/*
uniform vec3      iResolution;           // viewport resolution (in pixels)
uniform float     iGlobalTime;           // shader playback time (in seconds)
uniform float     iTimeDelta;            // render time (in seconds)
uniform int       iFrame;                // shader playback frame
uniform float     iChannelTime[4];       // channel playback time (in seconds)
uniform vec3      iChannelResolution[4]; // channel resolution (in pixels)
uniform vec4      iMouse;                // mouse pixel coords. xy: current (if MLB down), zw: click
uniform samplerXX iChannel0..3;          // input channel. XX = 2D/Cube
uniform vec4      iDate;                 // (year, month, day, time in seconds)
uniform float     iSampleRate;           // sound sample rate (i.e., 44100)*/

ShaderRenderer::ShaderRenderer() :
	mWindowWidth(0),
	mWindowHeight(0), 
	mStarted(false), 
	mLoaded(false), 
	mFrame(0), 
	mShaderProg(0)
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
	
}


// https://www.shadertoy.com/view/ldfGWn
// https://github.com/beautypi/shadertoy-iOS-v2/blob/a852d8fd536e0606377a810635c5b654abbee623/shadertoy/ShaderPassRenderer.m
// https://www.shadertoy.com/api/v1/shaders/lsXGzf?key=rtHtwn 
// https://github.com/jherico/qtvr/blob/master/app/src/shadertoy/Renderer.cpp

void ShaderRenderer::Draw()
{
	if (mStarted)
	{
		// set uniforms
		float deltaTime = static_cast<float>(mTimer->getDeltaTime());
		float elapsedTime = static_cast<float>(mTimer->getElapsedTime());

		tm tm = mTimer->tm_now();

		glUniform3f(variables.resolution, (float)mWindowWidth, (float)mWindowHeight, 1.0f);
		glUniform1i(variables.frame, mFrame++);

		glUniform1f(variables.globaltime, elapsedTime);
		glUniform1f(variables.timedelta, deltaTime);

		for (int i = 0; i < 4; i++)
		{
			glUniform1f(variables.channeltime[i], elapsedTime);
		}

		glUniform4f(variables.mouse, mouse_x, mouse_y, click_x, click_y);
		glUniform4f(variables.date, tm.tm_year, tm.tm_mon, tm.tm_mday,
			tm.tm_sec + tm.tm_min * 60 + tm.tm_hour * 3600);
		glUniform1f(variables.samplerate, 0);

		if (variables.devicerotationuniform > 0)
		{

		}

		float zeros2[2] = { 0, 0 };
		glUniform2fv(variables.fragcoordoffsetuniform, 1, zeros2);

		int tunit = 0;
		for (int i = 0; (i < 4 && i < (int)mShader.imagePass.inputs.size()); i++)
		{
			if (mShader.imagePass.inputs[i].ctype == "keyboard")
			{

			}
			if (mTextures[i]->id)
			{
				glActiveTexture(GL_TEXTURE0 + tunit);
				glBindTexture(mTextures[i]->targ, mTextures[i]->id);
				glUniform1i(variables.sampler[i], tunit);
				tunit++;
			}
		}

		glViewport(0, 0, static_cast<int>(mWindowWidth), static_cast<int>(mWindowHeight));
		glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
		glClear(GL_COLOR_BUFFER_BIT);
		assert(glGetError() == GL_NO_ERROR);

		assert(glGetError() == GL_NO_ERROR);
	}
}

void ShaderRenderer::UpdateWindowSize(GLsizei width, GLsizei height)
{
	if (!mStarted)
	{
		mWindowWidth = width;
		mWindowHeight = height;

		mStarted = true;

		memset(mKeyboardState, 0, sizeof(char) * 256 * 3);
		mFrame = 0;
		mTimer.reset(CreateTimer());

		mTimer->start();
	}
	else if (mWindowWidth != width || mWindowHeight != height)
	{
		mWindowWidth = width;
		mWindowHeight = height;
	}
}

void ShaderRenderer::BakeShader()
{
	// all crazy loading stuff here 

	//
	GLuint VertexShaderID = glCreateShader(GL_VERTEX_SHADER);
	GLuint FragmentShaderID = glCreateShader(GL_FRAGMENT_SHADER);

	const char* VertexSourcePointer = main_vertex_code();
	glShaderSource(VertexShaderID, 1, &VertexSourcePointer, NULL);
	glCompileShader(VertexShaderID);

	std::ostringstream shaderCode;

	shaderCode << format(shader_header,
		mTextures[0]->stype.c_str(),
		mTextures[1]->stype.c_str(),
		mTextures[2]->stype.c_str(),
		mTextures[3]->stype.c_str());

	shaderCode << mShader.imagePass.code << "\n\n";
	shaderCode << main_fragment_code() << "\n";

	std::string shaderCodeStr = shaderCode.str();
	const char*  FragmentSourcePointer = shaderCodeStr.c_str();

	glShaderSource(FragmentShaderID, 1, &FragmentSourcePointer, NULL);
	glCompileShader(FragmentShaderID);


	GLuint programId = glCreateProgram();
	glAttachShader(programId, VertexShaderID);
	glAttachShader(programId, FragmentShaderID);
	glLinkProgram(programId);

	glDeleteShader(VertexShaderID);
	glDeleteShader(FragmentShaderID);

	mShaderProg = programId;

	glUseProgram(mShaderProg);
	InitVertexBuffer();

	variables.resolution = glGetUniformLocation(mShaderProg, "iResolution");
	variables.globaltime = glGetUniformLocation(mShaderProg, "iGlobalTime");
	variables.date = glGetUniformLocation(mShaderProg, "iDate");
	variables.timedelta = glGetUniformLocation(mShaderProg, "iTimeDelta");
	variables.mouse = glGetUniformLocation(mShaderProg, "iMouse");
	variables.frame = glGetUniformLocation(mShaderProg, "iFrame");
	for (int i = 0; i<4; i++) 
	{
		char buf[64];
		sprintf(buf, "iChannelTime[%d]", i);
		variables.channeltime[i] = glGetUniformLocation(mShaderProg, buf);
		sprintf(buf, "iChannelResolution[%d]", i);
		variables.channelres[i] = glGetUniformLocation(mShaderProg, buf);
		sprintf(buf, "iChannel%d", i);
		variables.sampler[i] = glGetUniformLocation(mShaderProg, buf);
	}

	variables.fragcoordoffsetuniform = glGetUniformLocation(mShaderProg, "ifFragCoordOffsetUniform");
	variables.devicerotationuniform = glGetUniformLocation(mShaderProg, "iDeviceRotationUniform");

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
			//mTextures[i] = load_cubemap()
		}
		else if (mShader.imagePass.inputs[i].ctype == "texture")
		{
			//mTextures[i] = load_texture()
		}
	}
}

void ShaderRenderer::InitVertexBuffer()
{
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

	glGenVertexArraysOES(1, &mVertexArray);
	glBindVertexArrayOES(mVertexArray);

	glGenBuffers(1, &mVertexBuffer);
	glBindBuffer(GL_ARRAY_BUFFER, mVertexBuffer);
	glBufferData(GL_ARRAY_BUFFER, sizeof(Vertices), Vertices, GL_STATIC_DRAW);

	glGenBuffers(1, &mIndexBuffer);
	glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, mIndexBuffer);
	glBufferData(GL_ELEMENT_ARRAY_BUFFER, sizeof(Indices), Indices, GL_STATIC_DRAW);

	glBindVertexArrayOES(0);
}