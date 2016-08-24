#pragma once

#include <chrono>

class Timer

{
public:
	Timer()
		: mPreviousTime(0.0)
	{}

	virtual ~Timer() 
	{
	}

	virtual void start()
	{
		startTime = _clock.now();
	}

	virtual void stop()
	{

	}

	virtual double getElapsedTime()
	{
		std::chrono::duration<double> time_span = std::chrono::duration_cast<std::chrono::duration<double>>(_clock.now() - startTime);
		return time_span.count();
	}

	virtual double getDeltaTime()

	{
		double elapsedTime = getElapsedTime();
		double deltaTime = elapsedTime - mPreviousTime;

		mPreviousTime = elapsedTime;
		return deltaTime;
	}

	tm tm_now()
	{
		std::chrono::system_clock::time_point now = std::chrono::system_clock::now();
		time_t tt = std::chrono::system_clock::to_time_t(now);
		tm utc_tm;
		gmtime_s(&utc_tm, &tt);
		return utc_tm;
	}

private:
	double mPreviousTime;
	std::chrono::time_point<std::chrono::high_resolution_clock> startTime;

	std::chrono::high_resolution_clock _clock;
};


inline Timer *CreateTimer()
{
	return new Timer();
}