//
// This file is used by the template to render a basic scene using GL.
//

#include "pch.h"
#include "ShaderRenderer.h"

using namespace Platform;
using namespace Windows::UI::Core;
using namespace Windows::System;


// https://github.com/beautypi/shadertoy-iOS-v2/

ShaderRenderer::ShaderRenderer() :
	mWindowWidth(0),
	mWindowHeight(0), 
	mStarted(false), 
	mLoaded(false), 
	mFrame(0)
{
	mTimer.reset(CreateTimer());
	memset(mKeyboardState, 0, sizeof(char) * 256 * 3);
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
		float deltaTime = static_cast<float>(mTimer->getDeltaTime());
		float elapsedTime = static_cast<float>(mTimer->getElapsedTime());

		tm tm = mTimer->tm_now();

		// set uniforms
		glUniform3f(variables.resolution, (float)mWindowWidth, (float)mWindowHeight, 1.0f);
		glUniform1f(variables.globaltime, elapsedTime);
		
		for (int i = 0; i < 4; i++)
		{
			glUniform1f(variables.channeltime[i], elapsedTime);
		}

		glUniform1f(variables.timedelta, deltaTime);
		glUniform1f(variables.frame, deltaTime);

		glUniform4f(variables.mouse, mouse_x, mouse_y, click_x, click_y);
		glUniform4f(variables.date, tm.tm_year, tm.tm_mon, tm.tm_mday,
			tm.tm_sec + tm.tm_min * 60 + tm.tm_hour * 3600);


		glViewport(0, 0, static_cast<int>(mWindowWidth), static_cast<int>(mWindowHeight));
		glClearColor(0.0f, 0.0f, 0.0f, 1.0f);
		glClear(GL_COLOR_BUFFER_BIT);
		assert(glGetError() == GL_NO_ERROR);

		//glUseProgram(sdr);
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
}