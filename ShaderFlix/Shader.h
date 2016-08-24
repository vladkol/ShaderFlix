#pragma once


#include <ctime>

namespace ShaderFlix
{
	struct APIShaderPassInputSampler
	{
		std::string filter;
		std::string wrap;
		std::string vflip;
		std::string srgb;
	};
	
    struct APIShaderPassInput
	{
		int id;
		std::string src;
		std::string ctype;
		int channel;

		APIShaderPassInputSampler sampler;
		
		std::vector<std::string> chachedSourceFiles;

		APIShaderPassInput() : id(0), channel(0)
		{

		}
	};

	struct APIShaderPass
	{
		std::vector<APIShaderPassInput> inputs;
		std::string code;
		std::string type;
	};

	class Shader
	{
	public:
		Shader();
		~Shader();

		bool Initialize(const char* shaderId, const char* apiKey);

		std::string apiKey;

		std::string shaderId;
		std::string shaderName;
		std::string shaderDescription;
		std::string username;

		int viewed;
		int likes;

		std::time_t date;

		APIShaderPass imagePass;

	private:
		std::string DownloadShaderJSON();
		std::string CacheSource(const char* sourcePath);
		bool CacheSources();
		bool CacheShaderFlixFile(const char* sourcePath);
	};
}

