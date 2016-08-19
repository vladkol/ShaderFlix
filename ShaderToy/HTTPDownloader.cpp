#include "pch.h"

#include "HTTPDownloader.h"
#include <curl/curl.h>
#include <curl/easy.h>
#include <curl/curlbuild.h>
#include <sstream>
#include <iostream>
#include <cctype>
#include <codecvt>
#include "Utils.h"

#pragma comment(lib, "libcurl.lib")

using namespace std;

size_t write_data(void *ptr, size_t size, size_t nmemb, void *stream) 
{
	std::vector<unsigned char> *out = (std::vector<unsigned char>*) stream;
	const unsigned char *data = (const unsigned char*) ptr;

	out->insert(out->end(), data,  data + (size_t) size * nmemb);

	//string data((const char*) ptr, (size_t) size * nmemb);

	//*((stringstream*) stream) << data << endl;

	return size * nmemb;
}

HTTPDownloader::HTTPDownloader() {
	_curl = curl_easy_init();
}

HTTPDownloader::~HTTPDownloader() {
	curl_easy_cleanup((CURL*)_curl);
}

//string HTTPDownloader::downloadString(const std::string& url) {
//	CURL* curl = (CURL*) _curl;
//
//	curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
//	/* example.com is redirected, so we tell libcurl to follow redirection */
//	curl_easy_setopt(curl, CURLOPT_FOLLOWLOCATION, 1L);
//	curl_easy_setopt(curl, CURLOPT_NOSIGNAL, 1); //Prevent "longjmp causes uninitialized stack frame" bug
//	curl_easy_setopt(curl, CURLOPT_ACCEPT_ENCODING, "deflate");
//	
//	std::stringstream out;
//	
//	curl_easy_setopt(curl, CURLOPT_SSL_VERIFYPEER, false);
//
//	curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, write_data);
//	curl_easy_setopt(curl, CURLOPT_WRITEDATA, &out);
//	/* Perform the request, res will get the return code */
//	CURLcode res = curl_easy_perform(curl);
//	/* Check for errors */
//	if (res != CURLE_OK) {
//		fprintf(stderr, "curl_easy_perform() failed: %s\n",
//			curl_easy_strerror(res));
//	}
//	return out.str();
//}



string HTTPDownloader::downloadString(const std::string& url)
{
	std::string out;

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