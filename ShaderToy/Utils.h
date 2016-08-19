#pragma once

#include <vector>
#include <string>
#include <set>
#include <cctype>
#include <codecvt>
#include <sstream>
#include <algorithm>

#include <sys/stat.h>

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

	path += "shadertoy";
	_mkdir(path.c_str());
#endif

	return path;
}
