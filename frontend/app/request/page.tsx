"use client";

import React, { useState } from "react";

export default function RequestPage() {
  const [serviceType, setServiceType] = useState("Plumber");
  const [clientArea, setClientArea] = useState("Kilimani");
  const [dayType, setDayType] = useState("Weekday");
  const [timeSlot, setTimeSlot] = useState("Morning Rush");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Form submission handling (API integration will be implemented in a separate task)
    console.log("Submitted request:", {
      serviceType,
      clientArea,
      dayType,
      timeSlot,
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* 3-Step Progress Indicator */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between relative">
          {/* Connecting line */}
          <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-slate-200 -z-0" />

          {/* Step 1: Active */}
          <div className="flex items-center gap-2 bg-white px-2 z-10">
            <span className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-semibold text-sm shadow-sm">
              1
            </span>
            <span className="text-sm font-semibold text-indigo-600">
              Request Details
            </span>
          </div>

          {/* Step 2: Inactive */}
          <div className="flex items-center gap-2 bg-white px-2 z-10">
            <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 border border-slate-200 flex items-center justify-center font-semibold text-sm">
              2
            </span>
            <span className="text-sm font-medium text-slate-400">
              View Recommendations
            </span>
          </div>

          {/* Step 3: Inactive */}
          <div className="flex items-center gap-2 bg-white px-2 z-10">
            <span className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 border border-slate-200 flex items-center justify-center font-semibold text-sm">
              3
            </span>
            <span className="text-sm font-medium text-slate-400">
              Confirm Booking
            </span>
          </div>
        </div>
      </div>

      {/* Service Request Form */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 sm:p-8">
        <div className="mb-6 pb-4 border-b border-slate-100">
          <h1 className="text-2xl font-bold text-slate-900">
            Request a Household Service
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Specify your location and timing to find the most reliable available
            providers in Nairobi.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Service Type */}
          <div>
            <label
              htmlFor="serviceType"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Service Type
            </label>
            <select
              id="serviceType"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            >
              <option value="Electrician">Electrician</option>
              <option value="Plumber">Plumber</option>
              <option value="Cleaner">Cleaner</option>
              <option value="Technician">Technician</option>
              <option value="Carpenter">Carpenter</option>
            </select>
          </div>

          {/* Client Area */}
          <div>
            <label
              htmlFor="clientArea"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Client Area
            </label>
            <input
              type="text"
              id="clientArea"
              placeholder="e.g. Kilimani, Westlands, Karen, CBD..."
              value={clientArea}
              onChange={(e) => setClientArea(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            />
          </div>

          {/* Preferred Day */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Preferred Day
            </label>
            <div className="grid grid-cols-2 gap-4">
              <label
                className={`flex items-center justify-center p-3 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                  dayType === "Weekday"
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="dayType"
                  value="Weekday"
                  checked={dayType === "Weekday"}
                  onChange={() => setDayType("Weekday")}
                  className="sr-only"
                />
                <span>Weekday (Mon - Fri)</span>
              </label>

              <label
                className={`flex items-center justify-center p-3 rounded-lg border cursor-pointer text-sm font-medium transition-colors ${
                  dayType === "Weekend"
                    ? "border-indigo-600 bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <input
                  type="radio"
                  name="dayType"
                  value="Weekend"
                  checked={dayType === "Weekend"}
                  onChange={() => setDayType("Weekend")}
                  className="sr-only"
                />
                <span>Weekend (Sat - Sun)</span>
              </label>
            </div>
          </div>

          {/* Preferred Time Slot */}
          <div>
            <label
              htmlFor="timeSlot"
              className="block text-sm font-medium text-slate-700 mb-1"
            >
              Preferred Time Slot
            </label>
            <select
              id="timeSlot"
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
            >
              <option value="Morning Rush">Morning Rush (07:00 - 09:00)</option>
              <option value="Midday">Midday (11:00 - 14:00)</option>
              <option value="Evening Rush">Evening Rush (16:00 - 19:00)</option>
              <option value="Night">Night (21:00 - 05:00)</option>
              <option value="Weekend Day">Weekend Day (Daytime)</option>
            </select>
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full inline-flex items-center justify-center py-3 px-4 rounded-lg text-white font-medium bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 shadow-sm transition-colors"
            >
              Find Providers
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
