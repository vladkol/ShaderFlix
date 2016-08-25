#include "pch.h"

#include "HTTPDownloader.h"
#include <curl/curl.h>
#include <curl/easy.h>
#include <curl/curlbuild.h>
#include <sstream>
#include <iostream>
#include <fstream>
#include <cctype>
#include <codecvt>
#include "Utils.h"


#pragma comment(lib, "libcurl.lib")

using namespace std;

#ifdef HTTPDOWNLOADER_WITH_CACHE
	#include "rapidjson/stringbuffer.h"
	#include "rapidjson/writer.h"
	#include <functional>
	rapidjson::Document HTTPDownloader::_cache;
	std::shared_mutex HTTPDownloader::_cache_mutex;

	HTTPDownloader::HTTPDownloader::Flusher _flusher;

	void HTTPDownloader::FlushCache()
	{
		if (!_cache.HasParseError() && !_cache.IsNull())
		{
			std::unique_lock<std::shared_mutex> lock(_cache_mutex);
			rapidjson::StringBuffer buffer;

			rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
			_cache.Accept(writer);

			std::string cacheFilePath = get_appdata_path() + "/cache.json";
			std::string cacheStr = buffer.GetString();

			std::ofstream file;
			file.open(cacheFilePath, std::ios::out | std::ios::trunc);
			if (file.is_open())
			{
				file << cacheStr;
				file.close();
			}
		}
	}

	void HTTPDownloader::DeleteCacheItem(const char* url)
	{
		std::hash<std::string> hash;
		std::string urlHashNumber = std::to_string(hash(url));

		std::unique_lock<std::shared_mutex> lock(_cache_mutex);
		if (!_cache.HasParseError() && !_cache.IsNull() && _cache.HasMember(urlHashNumber.c_str()))
		{
			_cache.RemoveMember(urlHashNumber);
		}
	}
#endif


size_t HTTPDownloader::write_data(void *ptr, size_t size, size_t nmemb, void *stream)
{
	std::vector<unsigned char> *out = (std::vector<unsigned char>*) stream;
	const unsigned char *data = (const unsigned char*) ptr;

	out->insert(out->end(), data,  data + (size_t) size * nmemb);

	return size * nmemb;
}

HTTPDownloader::HTTPDownloader() 
{
	_curl = curl_easy_init();

#ifdef HTTPDOWNLOADER_WITH_CACHE
	if (_cache.IsNull())
	{
		std::unique_lock<std::shared_mutex> lock(_cache_mutex);
		if (_cache.IsNull()) // need another check, because mutex
		{

			std::string cacheFilePath = get_appdata_path() + "/cache.json";
			std::string cacheStr;

			std::ifstream file;
			file.open(cacheFilePath, std::ios::in);
			if (file.is_open())
			{
				file.seekg(0, std::ios::end);
				if (file.tellg() > 0)
				{
					cacheStr.reserve(file.tellg());
					file.seekg(0, std::ios::beg);

					cacheStr.assign((std::istreambuf_iterator<char>(file)),
						std::istreambuf_iterator<char>());

					rapidjson::StringStream stream(cacheStr.c_str());
					_cache.ParseStream(stream);
				}
				file.close();
			}
		}
	}
#endif

}

HTTPDownloader::~HTTPDownloader() {
	curl_easy_cleanup((CURL*)_curl);
}

string HTTPDownloader::downloadString(const std::string& url, bool cache /* = false */)
{
	std::string out;

#ifdef HTTPDOWNLOADER_WITH_CACHE
	std::hash<std::string> hash;
	std::string urlHashNumber = std::to_string(hash(url));
	if (cache && !_cache.HasParseError() && !_cache.IsNull() && _cache.HasMember(urlHashNumber.c_str()))
	{
		std::shared_lock<std::shared_mutex> lock(_cache_mutex);
		
		if (!_cache[urlHashNumber.c_str()].IsNull())
		{
			out = _cache[urlHashNumber.c_str()].GetString();
			if (out.length())
				return out;
		}
		else
		{
			_cache.RemoveMember(urlHashNumber.c_str());
		}
	}
#endif

	std::vector<unsigned char> data = download(url);
	if (data.size())
	{
		const unsigned char* charData = data.data();

		if (_contentType.length())
		{
			if (findstr_ignorecase(_contentType, "utf-8") != _contentType.end())
			{
				std::string source;
				source.append(charData, charData + data.size());

				std::wstring_convert<std::codecvt_utf8_utf16<unsigned short>, unsigned short> convert;
				std::basic_string<unsigned short> dest = convert.from_bytes(source);

				out = std::string(dest.begin(), dest.end());
			}
			else if (findstr_ignorecase(_contentType, "utf-16") != _contentType.end())
			{
				std::wstring wout;
				const wchar_t* wcharData = (const wchar_t*)charData;
				wout.append(wcharData, wcharData + data.size()/sizeof(wchar_t));
				out = std::string(wout.begin(), wout.end());
			}
			else
			{
				out.append(charData, charData + data.size());
			}
		}
	}

#ifdef HTTPDOWNLOADER_WITH_CACHE
	if (cache)
	{
		std::unique_lock<std::shared_mutex> lock(_cache_mutex);
		if (_cache.HasParseError())
			_cache.Clear();

		rapidjson::Value key(urlHashNumber.c_str(), _cache.GetAllocator());
		rapidjson::Value val(out.c_str(), _cache.GetAllocator());

		if (_cache.IsNull())
			_cache.SetObject();
		
		if (!_cache.HasMember(urlHashNumber.c_str()))
			_cache.AddMember(key, val, _cache.GetAllocator());
		else
			_cache[urlHashNumber.c_str()].SetString(out.c_str(), (rapidjson::SizeType)out.length());
	}
#endif


	return out;
}

std::vector<unsigned char> HTTPDownloader::download(const std::string& url) {
	CURL* curl = (CURL*) _curl;
	
	_contentType.clear();

	curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
	/* if url is redirected, we tell libcurl to follow redirection */
	curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
	curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1); //Prevent "longjmp causes uninitialized stack frame" bug
	curl_easy_setopt(curl, CURLOPT_ACCEPT_ENCODING, "gzip,deflate");
	
	std::vector<unsigned char> out;

	curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, false);

	curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_data);
	curl_easy_setopt(curl, CURLOPT_WRITEDATA, &out);
	/* Perform the request, res will get the return code */
	CURLcode res = curl_easy_perform(curl);
	/* Check for errors */
	if (res != CURLE_OK) 
	{
		fprintf(stderr, "curl_easy_perform() failed: %s\n",
			curl_easy_strerror(res));
	}
	else
	{
		const char* ct = nullptr;
		auto contentType = curl_easy_getinfo(curl, CURLINFO_CONTENT_TYPE, &ct);
		if (ct)
		{
			_contentType = ct;
		}
	}

	return out;
}