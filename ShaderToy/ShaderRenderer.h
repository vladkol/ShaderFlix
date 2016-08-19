#pragma once

// Enable function definitions in the GL headers below
#define GL_GLEXT_PROTOTYPES

#include <memory>

#include "Timer.h"

// OpenGL ES includes
#include <GLES2/gl2.h>
#include <GLES2/gl2ext.h>

// EGL includes
#include <EGL/egl.h>
#include <EGL/eglext.h>
#include <EGL/eglplatform.h>

#include <string>
#include <assert.h>

#include "Shader.h"
#include "stb_image.h"

class ShaderRenderer
{
public:
	ShaderRenderer();
	~ShaderRenderer();

	void Draw();
	void UpdateWindowSize(GLsizei width, GLsizei height);

	void InitShader(const char* appKey, const char* shaderId)
	{
		mShader.Initialize(shaderId, appKey);
		BakeShader();
	}

	void SetKeyState(unsigned int key, bool pressed)
	{
		if (key <= 256)
		{
			char state = pressed ? 255 : 0;
			mKeyboardState[key] = state;
			mKeyboardState[key + 256] = state;
			if (pressed)
			{
				mKeyboardState[key + 512] = 255 - mKeyboardState[key + 512];
			}
		}
	}

	void SetMouseState(bool bUpdateCoordinates, int x, int y, bool pressed)
	{
		if (bUpdateCoordinates)
		{
			mouse_x = x;
			mouse_y = y;
			if (pressed)
			{
				click_x = x;
				click_y = y;
			}
		}

		if(!pressed)
		{
			click_x = 0;
			click_y = 0;
		}
	}
	
protected:
	struct Texture
	{
		unsigned int id;
		unsigned int targ;
		unsigned int w;
		unsigned int h;
		std::string stype;
	};

	struct {
		int resolution;
		int globaltime;
		int timedelta;
		int frame;
		int channeltime[4];
		int channelres[4];
		int mouse;
		int samplerate[4];
		int date;
	} variables;

	static int load_gl_texture(const std::vector<std::string>& fnames, const std::string& wrapMode, const std::string filterMode, bool srgb, bool vflip, unsigned int& width, unsigned int &height)
	{
		int w = 0;
		int h = 0;
		int comp = 0;
		unsigned char* images[6] = { nullptr, nullptr, nullptr, nullptr, nullptr, nullptr };
		unsigned char* image = nullptr;

		bool isCubeMap = fnames.size() > 1;
		assert(!isCubeMap || fnames.size() == 6);
		if (isCubeMap && fnames.size() != 6)
		{
			return 0;
		}

		stbi_set_flip_vertically_on_load(vflip ? 1 : 0);

		image = stbi_load(fnames[0].c_str(), &w, &h, &comp, STBI_default);

		if (image == nullptr)
			return 0;

		unsigned int tex = 0;
		glGenTextures(1, &tex);

		glBindTexture(isCubeMap ? GL_TEXTURE_CUBE_MAP : GL_TEXTURE_2D, tex);


		GLint format = 0;

		switch (comp)
		{
		case STBI_grey:
			format = GL_LUMINANCE;
			break;
		case STBI_grey_alpha:
			format = GL_LUMINANCE_ALPHA;
			break;
		case STBI_rgb:
			format = srgb ? GL_SRGB_EXT : GL_RGB;
			break;
		case STBI_rgb_alpha:
			format = srgb ? GL_SRGB_ALPHA_EXT : GL_RGBA;
		default:
			assert(!"Invalid texture format!");
			break;

		}

		if (format != 0)
		{
			if (isCubeMap)
			{
				unsigned char* images[6];
				images[0] = image;

				glTexImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X, 0, format, w, h, 0, format, GL_UNSIGNED_BYTE, image);

				for (int i = 1; i < 6; i++)
				{
					images[i] = stbi_load(fnames[i].c_str(), &w, &h, &comp, STBI_default);
					glTexImage2D(GL_TEXTURE_CUBE_MAP_POSITIVE_X + i, 0, format, w, h, 0, format, GL_UNSIGNED_BYTE, images[i]);
				}
			}
			else
			{
				glTexImage2D(GL_TEXTURE_2D, 0, format, w, h, 0, format, GL_UNSIGNED_BYTE, image);
			}


			if (filterMode == "mipmap")
				glGenerateMipmap(GL_TEXTURE_2D);

			if (wrapMode == "repeat") {
				glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_REPEAT);
				glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_REPEAT);
			}
			else {
				glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
				glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
			}

			if (filterMode == "nearest") {
				glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
				glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
			}
			else if (filterMode == "mipmap") {
				glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR_MIPMAP_LINEAR);
				glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
			}
			else {
				glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
				glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
			}
		}

		glBindTexture(isCubeMap ? GL_TEXTURE_CUBE_MAP : GL_TEXTURE_2D, 0);

		stbi_image_free(image);
		if (isCubeMap)
		{
			for (int i = 1; i < 6; i++)
			{
				stbi_image_free(images[i]);
			}
		}

		width = (unsigned) w;
		height = (unsigned) w;

		return tex;
	}


	static Texture *load_texture(const char *fname, const std::string& wrapMode, const std::string filterMode, bool srgb, bool vflip)
	{
		Texture *tex = new Texture;

		std::vector<std::string> fnames;
		fnames.push_back(fname);

		tex->id = load_gl_texture(fnames, wrapMode, filterMode, srgb, vflip, tex->w, tex->h);

		if (!tex->id) {

			assert(!"failed to load texture");
			fprintf(stderr, "failed to load texture: %s\n", fname);

			return 0;

		}

		tex->targ = GL_TEXTURE_2D;
		tex->stype = "2D";

		return tex;

	}

	static Texture *load_cubemap(const std::vector<std::string>& fnames, const std::string& wrapMode, const std::string filterMode, bool srgb, bool vflip)
	{
		Texture *tex = new Texture;

		tex->id = load_gl_texture(fnames, wrapMode, filterMode, srgb, vflip, tex->w, tex->h);

		if (!tex->id) {

			assert(!"failed to load cubemap texture");
			fprintf(stderr, "failed to load cubemap textures\n");

			return 0;

		}

		tex->targ = GL_TEXTURE_CUBE_MAP;
		tex->stype = "Cube";

		return tex;

	}

	static Texture *create_keyboard_texture()
	{
		unsigned int tex = 0;
		glGenTextures(1, &tex);
		glBindTexture(GL_TEXTURE_2D, tex);

		char dummyData[256 * 3] = { 0 };

		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
		glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);

		glTexImage2D(GL_TEXTURE_2D, 0, GL_LUMINANCE, 256, 3, 0, GL_LUMINANCE, GL_UNSIGNED_BYTE, dummyData);

		glBindTexture(GL_TEXTURE_2D, 0);
	}

private:

	void BakeShader();

	std::unique_ptr<Timer> mTimer;
	int mFrame;
	bool mStarted;
	bool mLoaded;

	GLsizei mWindowWidth;
	GLsizei mWindowHeight;
	
	ShaderToy::Shader mShader;

	char mKeyboardState[256 * 3];
	int mouse_x, mouse_y, click_x, click_y;
};
