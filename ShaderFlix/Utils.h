#pragma once

#include <vector>
#include <string>
#include <set>
#include <cctype>
#include <codecvt>
#include <sstream>
#include <algorithm>
#include <iomanip>

#include <sys/stat.h>

#include <string>
#include <cstdarg>
#include <memory>
#include <experimental/filesystem>

inline std::string format(const char* format, ...)
{
	va_list args;
	va_start(args, format);
#ifndef _MSC_VER
	size_t size = std::snprintf(nullptr, 0, format, args) + 1; // Extra space for '\0'
	std::unique_ptr<char []> buf(new char[size]);
	std::vsnprintf(buf.get(), size, format, args);
	va_end(args);
	return std::string(buf.get(), buf.get() + size - 1); // We don't want the '\0' inside
#else
	std::string result;
	int size = _vscprintf(format, args) + 1;
	std::unique_ptr<char []> buf(new char[size]);
	vsnprintf_s(buf.get(), size, _TRUNCATE, format, args);
	result = (const char*) buf.get();
	va_end(args);
	return result;
#endif
}


inline std::string string_replace(std::string &s,
	const std::string &toReplace,
	const std::string &replaceWith)
{
	size_t start_pos = 0;
	while ((start_pos = s.find(toReplace, start_pos)) != std::string::npos) {
		s.replace(start_pos, toReplace.length(), replaceWith);
		start_pos += replaceWith.length();
	}

	return s;
}

inline std::vector<std::string> splitpath(
	const std::string& str
	, const std::set<char> delimiters)
{
	std::vector<std::string> result;

	char const* pch = str.c_str();
	char const* start = pch;
	for (; *pch; ++pch)
	{
		if (delimiters.find(*pch) != delimiters.end())
		{
			if (start != pch)
			{
				std::string str(start, pch);
				result.push_back(str);
			}
			else
			{
				result.push_back("");
			}
			start = pch + 1;
		}
	}
	result.push_back(start);

	return result;
}

inline std::string::const_iterator findstr_ignorecase(const std::string& str, const std::string& whatToFind)
{
	auto it = std::search(
		str.begin(), str.end(),
		whatToFind.begin(), whatToFind.end(),
		[](char ch1, char ch2) { return std::toupper(ch1) == std::toupper(ch2); }
	);
	return it;
}

inline std::string url_encode(const std::string &value) {
	std::ostringstream escaped;
	escaped.fill('0');
	escaped << std::hex;

	for (std::string::const_iterator i = value.begin(), n = value.end(); i != n; ++i) {
		std::string::value_type c = (*i);

		// Keep alphanumeric and other accepted characters intact
		if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') {
			escaped << c;
			continue;
		}

		// Any other characters are percent-encoded
		escaped << std::uppercase;
		escaped << '%' << std::setw(2) << int((unsigned char) c);
		escaped << std::nouppercase;
	}

	return escaped.str();
}

inline std::string get_appdata_path()
{
	std::string path;

#if defined WINAPI_FAMILY && WINAPI_FAMILY == WINAPI_FAMILY_APP
	
	std::wstring wpath = Windows::Storage::ApplicationData::Current->LocalCacheFolder->Path->Data();
	path = std::string(wpath.begin(), wpath.end());

#else
	#if defined WIN32
	
	path = getenv("LOCALAPPDATA");
	path += "\\";
		
	#else

	path += "/";
		
	#endif

	path += "ShaderFlix";
	_mkdir(path.c_str());
#endif

	return path;
}

inline void CachePresets(const std::string& srcPath)
{
	std::string dst = get_appdata_path() + "/presets/";
	std::experimental::filesystem::copy(srcPath, dst);
}
