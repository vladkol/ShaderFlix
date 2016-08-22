#include "pch.h"
#include "Shader.h"

#include "HTTPDownloader.h"
#include "rapidjson/document.h"

#include <chrono>
#include <sstream>
#include <fstream>
#include <experimental\filesystem>
#include "Utils.h"

using namespace ShaderToy;

Shader::Shader() : 
	viewed(0), 
	likes(0), 
	date(std::chrono::system_clock::to_time_t(std::chrono::system_clock::now()))
{
}


Shader::~Shader()
{
}

std::string Shader::DownloadShaderJSON()
{
	std::ostringstream stringStream;
	stringStream << "https://www.shadertoy.com/api/v1/shaders/" << shaderId << "?key=" << apiKey; //example: https://www.shadertoy.com/api/v1/shaders/ldfGWn?key=rtHtwn 

	std::string url = stringStream.str();

	std::string jsonstr;

	HTTPDownloader http;
	jsonstr = http.downloadString(url, true);

	return jsonstr;
}

bool Shader::Initialize(const char* shaderId, const char* apiKey)
{
	this->shaderId = shaderId;
	this->apiKey = apiKey;

	auto json = DownloadShaderJSON();

	if (!json.length())
		return false;

	rapidjson::Document doc;
	doc.Parse(json.c_str());

	if (doc.HasParseError() || !doc.HasMember("Shader"))
		return false;

	const rapidjson::Value& shader = doc["Shader"];
	const rapidjson::Value& info = shader["info"];
	
	this->shaderName = info["name"].GetString();
	this->shaderDescription = info["description"].GetString();
	this->username = info["username"].GetString();
	this->likes = info["likes"].GetInt();
	this->viewed = info["viewed"].GetInt();

	this->date = strtoull(info["date"].GetString(), nullptr, 10);

	const rapidjson::Value& renderpassArr = shader["renderpass"];
	unsigned int passCount = renderpassArr.GetArray().Size();

	bool hasInputError = false;

	for (unsigned int i = 0; i < passCount; i++)
	{
		const rapidjson::Value& renderpass = renderpassArr[i];
		if (std::string("image") != renderpass["type"].GetString())
			continue;

		imagePass.inputs.clear();
		imagePass.type = "image";
		imagePass.code = renderpass["code"].GetString();
		
		const rapidjson::Value& inputsArr = renderpassArr[i]["inputs"];
		unsigned int inputsCount = inputsArr.GetArray().Size();

		for (unsigned int k = 0; k < inputsCount; k++)
		{
			APIShaderPassInput input;
			input.id = inputsArr[k]["id"].GetInt();
			input.channel = inputsArr[k]["channel"].GetInt();
			input.src = inputsArr[k]["src"].GetString();
			input.ctype = inputsArr[k]["ctype"].GetString();

			if (input.ctype == "buffer" || input.ctype == "sound" || input.ctype == "video")
			{
				hasInputError = true;
				break;
			}

			const rapidjson::Value& sampler = inputsArr[k]["sampler"];
			input.sampler.filter = sampler["filter"].GetString();
			input.sampler.wrap = sampler["wrap"].GetString();
			input.sampler.vflip = sampler["vflip"].GetString();
			input.sampler.srgb = sampler["srgb"].GetString();

			imagePass.inputs.push_back(input);
		}

		break;
	}

	if (hasInputError)
	{
		return false;
	}

	return CacheSources();
}

std::string Shader::CacheSource(const char* sourcePath)
{
	std::string appData = get_appdata_path();
	std::string src = sourcePath;
	std::transform(src.begin(), src.end(), src.begin(), ::tolower);

	if (src.find("/") == 0 &&
		src.find("/usr/") != 0 &&
		src.find("/home/") != 0 &&
		src.find("/data/") != 0 &&
		src.find("/cache/") != 0 &&
		src.find("/sdcard/") != 0 &&
		src.find("/user/") != 0 &&
		src.find("/users/") != 0)
	{
		std::string path = appData + src;
		if (!std::experimental::filesystem::exists(path))
		{
			// need to download
			if (!CacheShadertoyFile(src.c_str()))
			{
				src.clear();
			}
		}

		src = path;
	}

	return src;
}

bool Shader::CacheSources()
{
	bool hasErrors = false;

	for(unsigned int index=0; index < imagePass.inputs.size(); index++)
	{
		APIShaderPassInput& input = imagePass.inputs[index];
		std::string src = input.src;
		std::vector<std::string> sourceFiles;

		std::string newSrc = CacheSource(src.c_str());
		if (newSrc.length() == 0)
		{
			hasErrors = true;
			continue;
		}

		sourceFiles.push_back(newSrc);

		if (input.ctype == "cubemap") // need 5 more images
		{
			auto parts = splitpath(src, std::set<char> {'\\', '/'});
			std::string filename = parts[parts.size() - 1];
			auto nameParts = splitpath(filename, std::set<char> {'.'});
			std::string ext = nameParts[nameParts.size() - 1];
			std::string nameWithoutExtAndNumber = filename.substr(0, filename.length() - ext.length() - 2);
			std::string srcWithoutFileName = src.substr(0, src.length() - filename.length());

			for (int i = 1; i < 6; i++)
			{
				std::ostringstream cubePartSrc;
				cubePartSrc << srcWithoutFileName << nameWithoutExtAndNumber << i << "." << ext;

				std::string cubePart = (cubePartSrc.str().c_str());
				cubePart = CacheSource(cubePart.c_str());

				if (cubePart.length() == 0)
				{
					hasErrors = true;
					sourceFiles.clear();
					break;
				}
				sourceFiles.push_back(cubePart);
			}
		}

		input.chachedSourceFiles = sourceFiles;
	}

	return !hasErrors;
}

bool Shader::CacheShadertoyFile(const char* sourcePath)
{
	HTTPDownloader http;
	std::string url = std::string("https://www.shadertoy.com") + sourcePath;
	auto data = http.download(url);

	if (!data.size())
	{
		return false;
	}

	std::string appData = get_appdata_path();
	std::string folder = appData;

	auto parts = splitpath(sourcePath, std::set<char> {'\\', '/'});

	// make sure folder exists
	for (unsigned int i = 0; i < (parts.size() - 1); i++)
	{
		if (!parts[i].length())
			continue;

		folder += "/";
		folder += parts[i];
#if defined WINAPI_FAMILY && WINAPI_FAMILY == WINAPI_FAMILY_APP
		std::wstring wfolder(folder.begin(), folder.end());
		_wmkdir(wfolder.c_str());
#else
		_mkdir(folder.c_str());
#endif
	}

	std::string path = appData + sourcePath;
	std::ofstream outfile(path, std::ios::out | std::ios::binary);
	outfile.write((const char*) (data.data()), data.size());
	outfile.close();

	return true;
}
