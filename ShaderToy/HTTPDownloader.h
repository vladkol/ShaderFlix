#pragma once
class HTTPDownloader {
public:
	HTTPDownloader();
	~HTTPDownloader();
	/**
	* Download a file using HTTP GET and store in in a std::string
	* @param url The URL to download
	* @return The download result
	*/
	std::string downloadString(const std::string& url);
	std::vector<unsigned char> download(const std::string& url);

private:
	void* _curl;
	std::string _contentType;
};
