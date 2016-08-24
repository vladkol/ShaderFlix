#pragma once

#define HTTPDOWNLOADER_WITH_CACHE

#ifdef HTTPDOWNLOADER_WITH_CACHE
#define RAPIDJSON_HAS_STDSTRING  1
#include "rapidjson\document.h" // only needed for cache
#include <shared_mutex>
#endif

class HTTPDownloader {

#ifdef HTTPDOWNLOADER_WITH_CACHE
public:
	class Flusher
	{
	public:
		Flusher()
		{
			#if defined WINAPI_FAMILY && WINAPI_FAMILY == WINAPI_FAMILY_APP
			Windows::ApplicationModel::Core::CoreApplication::Exiting += ref new Windows::Foundation::EventHandler<Platform::Object ^>(&OnExiting);
			Windows::ApplicationModel::Core::CoreApplication::Suspending += ref new Windows::Foundation::EventHandler<Windows::ApplicationModel::SuspendingEventArgs ^>(&OnSuspending);
			#endif		
		}

#if defined WINAPI_FAMILY && WINAPI_FAMILY == WINAPI_FAMILY_APP
		static void OnExiting(Platform::Object ^sender, Platform::Object ^args)
		{
			HTTPDownloader::FlushCache();
		}
		static void OnSuspending(Platform::Object ^sender, Windows::ApplicationModel::SuspendingEventArgs ^args)
		{
			HTTPDownloader::FlushCache();
		}
#else
		~Flusher()
		{
			HTTPDownloader::FlushCache();
		}
#endif

	};


#endif
public:
	HTTPDownloader();
	~HTTPDownloader();
	/**
	* Download a file using HTTP GET and store in in a std::string
	* @param url The URL to download
	* @return The download result
	*/
	std::string downloadString(const std::string& url, bool cache = false);
	std::vector<unsigned char> download(const std::string& url);

#ifdef HTTPDOWNLOADER_WITH_CACHE
	static void FlushCache();
	static void DeleteCacheItem(const char* url);
#endif

private:
	static size_t write_data(void *ptr, size_t size, size_t nmemb, void *stream);

private:
	void* _curl;
	std::string _contentType;

#ifdef HTTPDOWNLOADER_WITH_CACHE
	static rapidjson::Document _cache;
	static std::shared_mutex _cache_mutex;
	static Flusher _flusher;
#endif
};





