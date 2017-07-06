
/// <loc filename="metadata\ad.xml" format="messagebundle" />
/*!
  Copyright (C) Microsoft. All rights reserved.
  This library is supported for use in Windows Store apps only.
*/
(function () {
    "use strict";

    if (typeof (MicrosoftNSJS) === "undefined") {
        Object.defineProperty(window, "MicrosoftNSJS", { value: {}, writable: false, enumerable: true, configurable: true });
    }
    if (typeof (MicrosoftNSJS.Advertising) === "undefined") {
        Object.defineProperty(MicrosoftNSJS, "Advertising", { value: {}, writable: false, enumerable: true, configurable: true });
    }

    /// <summary locid="MicrosoftNSJS.Advertising">Microsoft Advertising SDK allows developers to add ads to their apps.</summary>
    /// <htmlSnippet><![CDATA[<div data-win-control="MicrosoftNSJS.Advertising.AdControl"></div>]]></htmlSnippet>
    /// <event name="onAdRefreshed" locid="MicrosoftNSJS.Advertising.AdControl.onAdRefreshed">Raised when the ad refreshes</event>
    /// <event name="onErrorOccurred" locid="MicrosoftNSJS.Advertising.AdControl.onErrorOccurred">Raised when error occurs</event>
    /// <event name="onEngagedChanged" locid="MicrosoftNSJS.Advertising.AdControl.onEngagedChanged">Raised when the user clicks an ad and begins an expanded experience, or when the user clicks away from it</event>
    MicrosoftNSJS.Advertising.AdControl = function (element, options) {
        /// <summary locid="MicrosoftNSJS.Advertising.AdControl">
        ///   The Microsoft AdControl allows developers to add ads to their apps.
        /// </summary>
        /// <param name="element" type="HTMLElement" domElement="true" locid="MicrosoftNSJS.Advertising.AdControl_p:element">
        ///   The DOM element to be associated with the AdControl.
        /// </param>
        /// <param name="options" type="object" locid="MicrosoftNSJS.Advertising.AdControl_p:options">
        ///   The set of options to be applied initially to the AdControl.
        /// </param>
        /// <returns type="MicrosoftNSJS.Advertising.AdControl" locid="MicrosoftNSJS.Advertising.AdControl_returnValue">A constructed AdControl.</returns>

        var self = this;

        this._log("AdControl:Constructor:s", { fnName: "Constructor" });

        try {
            if (element === null || typeof (element) === "undefined") {
                element = document.createElement("div");
            } else if (this._isElementAllowed(element)) {
                element = element;
            } else {
                // return an un-initialised object
                return;
            }

            MicrosoftNSJS.Advertising.AdUtilities.addClassToElement(element, "win-disposable");

            element.winControl = this;

            // initialize instance variables
            this._adsGlobalEventManager = new MicrosoftNSJS.Advertising.AdGlobalEventManager();
            this._globalAdEngagedHandler = null;
            this._globalAdDisengagedHandler = null;
            this._ad = null; // the ad currently being displayed

            this._currentAdHeight = null;
            this._currentAdWidth = null;
            this._isDisposed = false;
            this._isSuspended = false;

            this._isAutoRefreshEnabled = true;

            this._refreshIntervalSec = 60;
            this._refreshTimerId = null;
            this._requestInProgress = false;
            this._timeAtLastRotation = null;

            this._adContainer = null;

            this._adController = new MicrosoftNSJS.Advertising.DisplayAdController();
            this._adController.onErrorFired = this._fireErrorOccurred.bind(this);

            this._fadeOptions = {
                timer: { linear: " cubic-bezier(0,0,1,1)" },
                fadeInTimeS: 0.7
            };
            this._adInstanceState = null; // stores state data to be passed between default and expanded views

            // event handlers
            this._onAdRefreshedInternal = null;
            this._onAdRefreshed = null;
            this._onErrorOccurred = null;


            this._onEngagedChanged = null;
            this._onPointerDown = null;
            this._onPointerUp = null;
            this._onPointerMove = null;
            this._onMouseWheel = null;
            this._onManipulationStateChanged = null;

            this._preventDefaultAppHandlers = false;
            this._applicationEventsMask = 0;

            // if we are in a multi-column layout, make sure the ad is not split across columns
            element.style.breakInside = "avoid";
            element.style.overflow = "hidden";

            // Set the position to relative if the user has not specified a position on the ad control element. Ad iFrame is 
            // positioned as absolute so it will position absolute in relation to the nearest positioned element. If no parents
            // specify a position it will cause the Ad iFrame to be anchored relative to the viewport/body. This behavior
            // can still be explicitly achieved by user if they set position:static on the ad div if they require it.
            // TFS #869047
            if (element.style.position === "") {
                element.style.position = "relative";
            }

            MicrosoftNSJS.Advertising.AdUtilities.setOptions(this, options);

            if (element.id === null || element.id === "") {
                // If the ad control div does not have an id, we need to generate one.
                element.id = this._generateUniqueId();
            }
            this._domElement = element;

            this._setupEvents();

            setImmediate(function () {
                // make the initial ad request, but only if one isn't already started and no ad already received
                if (!self._requestInProgress && self._ad === null) {
                    self._refreshInternal();
                }
            });

            this._log("AdControl:Constructor:e", { fnName: "Constructor" });
        }
        catch (err) {
            return;
        }
    };

    // If an app is using WinJS, mark the function as supported for processing so that an AdControl can 
    // be defined in HTML.
    if (typeof (WinJS) !== "undefined" && typeof (WinJS.Utilities) !== "undefined") {
        WinJS.Utilities.markSupportedForProcessing(MicrosoftNSJS.Advertising.AdControl);
    }

    MicrosoftNSJS.Advertising.AdControl.prototype = {
        // If updating this, make sure to also update in bootstrap.
        _EVENT_TYPE_ENUM: {
            All: ~0,
            PointerDown: 1, //1 << 0
            PointerUp: 1 << 1,
            PointerMove: 1 << 2,
            // 1 << 3, was used by pointer hover but freed up due to TFS #864590
            MouseWheel: 1 << 4,
            ManipulationStateChanged: 1 << 5
            // We can only send a max of 1<<31 events this way.
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising.AdControl.onAdRefreshed">
        ///   This event is fired when the AdControl receives a new ad from the server.
        ///   The handler function takes a single parameter which is the AdControl which fired the event.
        /// </field>
        get onAdRefreshed() { return this._onAdRefreshed; },
        set onAdRefreshed(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onAdRefreshed = value;
            }
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising.AdControl.onErrorOccurred">
        ///   This event is fired when the AdControl experiences an error.
        ///   The handler function takes two parameters: the AdControl which fired the event, 
        ///   and JSON containing errorMessage and errorCode values.
        /// </field>
        get onErrorOccurred() { return this._onErrorOccurred; },
        set onErrorOccurred(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onErrorOccurred = value;
            }
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising.AdControl.onEngagedChanged">
        ///   When the user clicks on an ad and begins an expanded experience, this event is fired. The
        ///   app must then call isEngaged to see whether this is an engage or disengage event.
        ///   The handler function takes a single parameter which is the AdControl which fired the event.
        /// </field>
        get onEngagedChanged() { return this._onEngagedChanged; },
        set onEngagedChanged(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onEngagedChanged = value;
            }
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising.AdControl.onPointerDown">
        ///   This event is fired when the user pushes down inside of the ad control using mouse, pointer, or touch.  The application can
        ///   use this event to animate the ad control for visual touch down feedback.  The ad may suppress this event if it is providing
        ///   visual touch down feedback itself.
        ///   The handler function takes a single parameter which is the event object containing the coordinates at which the event occurred.
        /// </field>
        get onPointerDown() { return this._onPointerDown; },
        set onPointerDown(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onPointerDown = value;

                if (typeof (value) === "function") {
                    this._addApplicationEventType(this._EVENT_TYPE_ENUM.PointerDown);
                    this._updateApplicationEvents();
                }
                else {
                    this._removeApplicationEventType(this._EVENT_TYPE_ENUM.PointerDown);
                    this._updateApplicationEvents();
                }
            }
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising.AdControl.onPointerUp">
        ///   This event is fired when the user releases a push down inside of the ad control using mouse, pointer, or touch.  The application 
        ///   can use this event to animate the ad control for visual touch down feedback.  The ad may suppress this event if it is providing
        ///   visual touch down feedback itself.
        ///   The handler function takes no parameters.
        /// </field>
        get onPointerUp() { return this._onPointerUp; },
        set onPointerUp(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onPointerUp = value;

                if (typeof (value) === "function") {
                    this._addApplicationEventType(this._EVENT_TYPE_ENUM.PointerUp);
                }
                else {
                    this._removeApplicationEventType(this._EVENT_TYPE_ENUM.PointerUp);
                }

                this._updateApplicationEvents();
            }
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising.AdControl.onMouseWheel">
        ///   This event is fired when the AdControl receives a mouse wheel event from the adControl.
        ///   The handler function takes two parameters:
        ///     sender: the object which fired the event (ie: the ad control)
        ///     evt: shortened standard html mouse wheel event containing clientX, clientY, wheelDelta and ctrlKey properties
        /// </field>
        get onMouseWheel() { return this._onMouseWheel; },
        set onMouseWheel(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onMouseWheel = value;

                if (typeof (value) === "function") {
                    this._addApplicationEventType(this._EVENT_TYPE_ENUM.MouseWheel);
                }
                else {
                    this._removeApplicationEventType(this._EVENT_TYPE_ENUM.MouseWheel);
                }

                this._updateApplicationEvents();
            }
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising.AdControl.onPointerMove">
        ///   This event is fired when the AdControl receives a pointer move event from the adControl.
        ///   The handler function takes two parameters:
        ///     sender: the object which fired the event (ie: the ad control)
        ///     evt: shortened standard html mouse wheel event containing clientX and clientY properties
        /// </field>
        get onPointerMove() { return this._onPointerMove; },
        set onPointerMove(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onPointerMove = value;

                if (typeof (value) === "function") {
                    this._addApplicationEventType(this._EVENT_TYPE_ENUM.PointerMove);
                }
                else {
                    this._removeApplicationEventType(this._EVENT_TYPE_ENUM.PointerMove);
                }

                this._updateApplicationEvents();
            }
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising.AdControl.onManipulationStateChanged">
        ///   This event is fired when the AdControl receives a manipulation state changed event from the adControl.
        ///   The handler function takes two parameters:
        ///     sender: the object which fired the event (ie: the ad control)
        ///     evt: shortened standard html mouse wheel event containing lastState and currentState properties
        /// </field>
        get onManipulationStateChanged() { return this._onManipulationStateChanged; },
        set onManipulationStateChanged(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onManipulationStateChanged = value;

                if (typeof (value) === "function") {
                    this._addApplicationEventType(this._EVENT_TYPE_ENUM.ManipulationStateChanged);
                }
                else {
                    this._removeApplicationEventType(this._EVENT_TYPE_ENUM.ManipulationStateChanged);
                }

                this._updateApplicationEvents();
            }
        },

        /// <field type="Boolean" locid="MicrosoftNSJS.Advertising.AdControl.preventDefaultApplicationEvents">
        ///   Flag the specifies whether to prevent bubbling of application events or not.
        /// </field>
        get preventDefaultApplicationEvents() { return this._preventDefaultAppHandlers; },
        set preventDefaultApplicationEvents(value) {
            if (this._preventDefaultAppHandlers !== value) {
                this._preventDefaultAppHandlers = value;
            }
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising.AdControl.applicationId">
        ///   The application ID of the app. This value is provided to you when you register the app with pubCenter.
        /// </field>
        get applicationId() { return this._adController.applicationId; },
        set applicationId(value) {
            if (this._adController.applicationId !== value) {
                this._adController.applicationId = value;
            }
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising.AdControl.adUnitId">
        ///   The adUnitId as provisioned on pubCenter. This id specifies the width, height, and format of ad.
        /// </field>
        get adUnitId() { return this._adController.adUnitId; },
        set adUnitId(value) {
            if (this._adController.adUnitId !== value) {
                this._adController.adUnitId = value;
            }
        },

        /// <field type="Boolean" locid="MicrosoftNSJS.Advertising.AdControl.isAutoRefreshEnabled">
        ///   Whether the AdControl should automatically request new ads.
        /// </field>
        get isAutoRefreshEnabled() { return this._isAutoRefreshEnabled; },
        set isAutoRefreshEnabled(value) {
            if (this._isAutoRefreshEnabled !== value) {
                this._isAutoRefreshEnabled = value;
                if (this._isAutoRefreshEnabled) {
                    this._scheduleRefresh();
                } else {
                    this._unscheduleRefresh();
                }
            }
        },

        /// <field type="Number" locid="MicrosoftNSJS.Advertising.AdControl.autoRefreshIntervalInSeconds">
        ///   The time (in seconds) between automatic ad refreshes.
        ///   If the set value is less than the minimum, the minimum value will be used.
        /// </field>
        get autoRefreshIntervalInSeconds() { return this._refreshIntervalSec; },
        set autoRefreshIntervalInSeconds(value) {
            if (typeof (value) === "string") {
                value = parseInt(value);
            }
            if (this._refreshIntervalSec === value) {
                return;
            }
            if (typeof (value) !== "number" || value < MicrosoftNSJS.Advertising.AdControl._minRefreshIntervalSec || isNaN(value)) {
                this._refreshIntervalSec = MicrosoftNSJS.Advertising.AdControl._minRefreshIntervalSec;
            } else {
                this._refreshIntervalSec = value;
            }
            this._unscheduleRefresh();
            this._scheduleRefresh();
        },

        /// <field type="Boolean" locid="MicrosoftNSJS.Advertising.AdControl.isEngaged">
        ///   Gets a value that indicates whether the user is currently interacting with the ad.
        /// </field>
        get isEngaged() {
            return (this._adContainer && this._adContainer.isEngaged ? true : false);
        },

        /// <field type="Boolean" locid="MicrosoftNSJS.Advertising.AdControl.isSuspended">
        ///   Gets the current suspended state of the <c>AdControl</c>.
        /// </field>
        get isSuspended() { return this._isSuspended; },

        /// <field type="Boolean" locid="MicrosoftNSJS.Advertising.AdControl.hasAd">
        ///   Returns true if the <c>AdControl</c> has received an ad from the server.
        /// </field>
        get hasAd() { return this._adContainer !== null; },

        /// <field type="String" locid="MicrosoftNSJS.Advertising.AdControl.keywords">
        ///   Keywords to be used in ad targeting.
        /// </field>
        get keywords() { return this._adController.keywords; },
        set keywords(value) {
            if (this._adController.keywords !== value) {
                this._adController.keywords = value;
            }
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising.AdControl.countryOrRegion">
        ///   The country or region of the user.
        /// </field>
        get countryOrRegion() { return this._adController.countryOrRegion; },
        set countryOrRegion(value) {
            if (this._adController.countryOrRegion !== value) {
                this._adController.countryOrRegion = value;
            }
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising.AdControl.postalCode">
        ///   The postal code of the user.
        /// </field>
        get postalCode() { return this._adController.postalCode; },
        set postalCode(value) {
            if (this._adController.postalCode !== value) {
                this._adController.postalCode = value;
            }
        },

        /// <field type="HTMLElement" domElement="true" hidden="true" locid="MicrosoftNSJS.Advertising.AdControl.element">
        ///   The DOM element which is the AdControl
        /// </field>
        get element() {
            return this._domElement;
        },

        addAdTag: function (tagName, tagValue) {
            /// <summary locid="MicrosoftNSJS.Advertising.AdControl.addAdTag">
            ///   Add an ad tag to the ad control. The maximum is 10 tags per ad control.
            ///   If maximum is exceeded an errorOccurred event will be fired.
            /// </summary>
            /// <param name="tagName" locid="MicrosoftNSJS.Advertising.AdControl.addAdTag_p:tagName">The name of the tag. Maximum of 16 characters, if exceeded an errorOccurred event will be fired.</param>
            /// <param name="tagValue" locid="MicrosoftNSJS.Advertising.AdControl.addAdTag_p:tagValue">The value of the tag. Maximum of 128 characters, if exceeded an errorOccurred event will be fired.</param>
            this._adController.addAdTag(tagName, tagValue);
        },

        removeAdTag: function (tagName) {
            /// <summary locid="MicrosoftNSJS.Advertising.AdControl.removeAdTag">
            ///   Remove an ad tag from the ad control. This has no effect if the tag name does not exist.
            /// </summary>
            /// <param name="tagName" locid="MicrosoftNSJS.Advertising.AdControl.removeAdTag_p:tagName">The name of the tag to remove.</param>
            this._adController.removeAdTag(tagName);
        },

        refresh: function () {
            /// <summary locid="MicrosoftNSJS.Advertising.AdControl.refresh">
            /// <para>
            ///   A call to this method directs the <c>AdControl</c> to show the next ad as soon as an ad
            ///   becomes available.
            /// </para>
            /// <para>
            ///   This method may not be used when <c>IsAutoRefreshEnabled</c> is set to <c>true</c>.
            /// </para>
            /// </summary>
            /// <remarks>
            ///   A new ad might not be available because of an error that occurred while trying to contact the ad platform.
            /// </remarks>

            if (this._isAutoRefreshEnabled) {
                this._adController.fireErrorOccurred("refresh() may not be called when auto-refresh is enabled (isAutoRefreshEnabled=true)", MicrosoftNSJS.Advertising.AdErrorCode.refreshNotAllowed);
                return;
            }

            if (!this._checkIfRefreshIntervalMetAndRaiseError()) {
                return;
            }

            this._refreshInternal();
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising.AdControl.suspend">
        ///   This function is used to suspend the current advertisement. This can be used in a case of a Skype call coming in and the application
        ///   developer needing to suspend the ad in order for the call to proceed. See resume function for resuming the advertisement.
        /// </field>
        suspend: function () {
            if (this._adContainer) {
                // If the ad control is currently expanded it will need to be collapsed.
                if (this._adContainer.mraidState === MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.EXPANDED) {
                    this._adContainer.close();
                }

                this._adContainer.suspend();
            }

            this._isSuspended = true;
            this._unscheduleRefresh(); // this has to be called last in case above code tries to schedule refresh again (ie _closePopup)
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising.AdControl.resume">
        ///   This function is used to resume the current advertisement. This can be used in a case of a Skype call ending and the application
        ///   needing to resume the advertisement. See suspend function for how to suspend and advertisement.
        /// </field>
        resume: function () {
            if (this._adContainer) {
                this._adContainer.resume();
            }

            this._isSuspended = false;
            this._scheduleRefresh();
        },

        dispose: function () {
            /// <summary locid="MicrosoftNSJS.Advertising.AdControl.dispose">
            ///   A call to this method directs the <c>AdControl</c> to release resources and unregister listeners.
            /// </summary>
            /// <remarks>
            ///   The <c>AdControl</c> will not function after this is called. 
            /// </remarks>
            try {
                this._log("AdControl.dispose:s", "dispose");

                if (typeof (this._onVisibilityChangeHandler) === "function") {
                    document.removeEventListener("visibilitychange", this._onVisibilityChangeHandler);
                    this._onVisibilityChangeHandler = null;
                }

                if (typeof (this._mselementresizeHandler) === "function") {
                    if (this._domElement !== null) {
                        this._domElement.removeEventListener("mselementresize", this._mselementresizeHandler)
                    }
                    this._mselementresizeHandler = null
                }

                if (typeof (this._resizeHandler) === "function") {
                    window.removeEventListener("resize", this._resizeHandler);
                    this._resizeHandler = null;
                }

                if (typeof (this._domNodeRemovedHandler) === "function") {
                    if (this._domElement !== null) {
                        this._domElement.removeEventListener("DOMNodeRemoved", this._domNodeRemovedHandler);
                    }
                    this._domNodeRemovedHandler = null;
                }


                if (this._adContainer) {
                    this._adContainer.dispose();
                    this._adContainer = null;
                }

                this._onAdRefreshedInternal = null;
                this._onAdRefreshed = null;
                this._onEngagedChanged = null;
                this._onPointerDown = null;
                this._onPointerUp = null;
                this._onMouseWheel = null;
                this._onPointerMove = null;
                this._onManipulationStateChanged = null;
                this._unscheduleRefresh();
                Windows.Networking.Connectivity.NetworkInformation.removeEventListener("networkstatuschanged", this._networkChangedEventHandler);
                this._networkChangedEventHandler = null;
                this._applicationEventsMask = 0;
                this._preventDefaultAppHandlers = false;
                this._adsGlobalEventManager.removeEventListener(MicrosoftNSJS.Advertising.AdGlobalEventManager.EVENT_TYPE.AD_ENGAGED, this._globalAdEngagedHandler);
                this._adsGlobalEventManager.removeEventListener(MicrosoftNSJS.Advertising.AdGlobalEventManager.EVENT_TYPE.AD_DISENGAGED, this._globalAdDisengagedHandler);
                this._adsGlobalEventManager.dispose();
                if (this._adController) {
                    this._adController.dispose();
                    this._adController = null;
                }

                if (this._domElement !== null) {
                    this._domElement.winControl = null;
                    this._domElement.onresize = null;
                    this._domElement = null;
                }
                this._isDisposed = true;
                this._log("AdControl.dispose:e", "dispose");
            }
            catch (err) {
            }
        },

        _checkIfRefreshIntervalMetAndRaiseError: function () {
            if (!this._timeAtLastRotation) {
                this._timeAtLastRotation = new Date();
                return true;
            }

            var refreshInterval = this._adController._MIN_AD_REFRESH_INTERVAL_MS;
            var isIntervalMet = new Date() - this._timeAtLastRotation >= refreshInterval;

            if (!isIntervalMet) {
                this._adController.fireErrorOccurred("refresh() may not be called more than once every " + refreshInterval / 1000 + " seconds.", MicrosoftNSJS.Advertising.AdErrorCode.refreshNotAllowed);
            }

            return isIntervalMet;
        },

        _refreshInternal: function () {
            if (this._requestInProgress) {
                this._adController.fireErrorOccurred("refresh triggered but request is already in progress", MicrosoftNSJS.Advertising.AdErrorCode.refreshNotAllowed);
                return;
            }

            try {
                if (Windows.ApplicationModel.DesignMode.designModeEnabled) {
                    // if we're on the blend design surface do nothing
                    return;
                }
            }
            catch (err) {
            }

            if (window !== top) {
                // The AdControl may not be loaded in an iframe. This scenario is disallowed by policy.
                this._adController.fireErrorOccurred("ad control may not be loaded in an iframe", MicrosoftNSJS.Advertising.AdErrorCode.other);
                return;
            }

            if (this._domElement === null || this._domElement.offsetWidth === 0 || this._domElement.offsetHeight === 0) {
                // AdControl has been removed from screen. Just return. Do not schedule a future refresh.
                // If returned to document later, resized event will fire and restart ad.
                return;
            }

            if (this._adContainer && this._adContainer.mraidState === MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.EXPANDED) {
                // No need to schedule another refresh attempt. Refresh will be rescheduled when expanded ad is closed.
                this._adController.fireErrorOccurred("ad control cannot refresh when ad is expanded", MicrosoftNSJS.Advertising.AdErrorCode.refreshNotAllowed);
                return;
            }

            if (this._adContainer && this._adContainer.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.SUSPENDED) {
                this._adController.fireErrorOccurred("ad control cannot refresh when suspended", MicrosoftNSJS.Advertising.AdErrorCode.refreshNotAllowed);
                return;
            }

            if (this.isEngaged) {
                // No need to schedule another refresh attempt. Refresh will be rescheduled when isEngaged is set back to true.
                this._adController.fireErrorOccurred("ad control cannot refresh when ad is engaged", MicrosoftNSJS.Advertising.AdErrorCode.refreshNotAllowed);
                return;
            }

            if (typeof (window._msAdEngaged) !== "undefined" && window._msAdEngaged) {
                // If another ad is engaged (e.g. expanded) then do not update this ad since it is likely
                // obscured by the expanded ad.
                // If auto-refresh is enabled, schedule a future refresh.
                this._scheduleRefresh();
                return;
            }

            if (!this._validateParameters()) {
                // Some parameters are invalid, so just return.
                // If auto-refresh is enabled, schedule a future refresh.
                this._scheduleRefresh();
                return;
            }

            if (this._adContainer !== null && (document.hidden || !this._adContainer.isOnScreen())) {
                // Except for the initial ad load, do not allow refresh unless ad is on screen.
                this._adController.fireErrorOccurred("refresh not performed because ad is not on screen", MicrosoftNSJS.Advertising.AdErrorCode.refreshNotAllowed);
                this._scheduleRefresh();
                return;
            }

            this._requestInProgress = true;
            //setup width and height for placement
            this._setupAdController();
            this._adController.requestAd().then(
                this._adRefreshedCallback.bind(this),
                function errorHandler(error) {
                    this._requestInProgress = false;
                    if (error !== null) {
                        this._log("DisplayAdController:_requestAd:Receive error:" + error.errorMessage, "_requestAd");
                        this._errorOccurredCallback(error);
                    }
                }.bind(this)
            );
            this._timeAtLastRotation = new Date();
        },

        _networkChangedEventHandler: null, /* empty function will be initialized in event setup*/

        // This is the callback for when the AdPlacement class fires an error event. We
        // re-fire the event.
        _errorOccurredCallback: function (evt) {

            if (this._isDisposed)
                return;

            this._adController.errorOccurredCallback(evt);

            // clear the dimensions of the "current" ad
            this._currentAdHeight = null;
            this._currentAdWidth = null;

            this._requestInProgress = false;

            // the ad request failed so schedule a refresh
            this._scheduleRefresh();
        },

        // This is the callback for when the AdPlacement class fires an AdRefreshed event.
        // Show the new ad and re-fire the event.
        _adRefreshedCallback: function (ad) {
            if (this._isDisposed) {
                return;
            }

            if (ad !== null) {
                this._onAdReceived(ad);
            }

            this._requestInProgress = false;

            // the ad has been received so schedule a refresh
            this._scheduleRefresh();
        },

        // Adds an application event type to subscribe to.
        _addApplicationEventType: function (eventType) {
            if (eventType !== null && typeof (eventType) === "number" && (eventType & this._applicationEventsMask) === 0) {
                this._applicationEventsMask = this._applicationEventsMask | eventType;
            }
        },

        // Removes an application event type to subscribe to.
        _removeApplicationEventType: function (eventType) {
            var off;

            if (eventType !== null && typeof (eventType) === "number" && (eventType & this._applicationEventsMask) !== 0) {
                off = eventType ^ (~0);
                this._applicationEventsMask = this._applicationEventsMask & off;
            }
        },

        // Communicates to the ad container to wire event types. Will send the currently set events on the applicationEventsMask.
        // All events that are not set on the applicationEventsMask will not be wired or will be unwired if already wired.
        _updateApplicationEvents: function () {
            if (this._isDisposed === true) {
                return;
            }

            if (this._requestInProgress === true) {
                return; // do nothing for now, once request is complete it will attempt to wire events.
            }
            try {
                if (this._adContainer && this._adContainer.mraidState !== MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.EXPANDED) {
                    this._adContainer.postMessage({
                        msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_WIREAPPEVENTS + ":" +
                            JSON.stringify({ "events": this._applicationEventsMask, "preventDefault": this.preventDefaultApplicationEvents })
                    });
                }
            }
            catch (err) {
                return;
            }
        },

        // When an ad response is received from the server, this function is called so the control can display it.
        _onAdReceived: function (ad) {
            if (this._isDisposed)
                return;

            if (typeof (ad) !== "undefined" && ad !== null) {
                // reset the ad control state on refresh
                this._resetAdControl();

                this._ad = ad;
                // store the dimensions of the new ad so we know whether we need to request a new ad when ad control size changes
                this._currentAdHeight = this._adController.placement.height;
                this._currentAdWidth = this._adController.placement.width;

                this._createBannerContainer(ad);
            }
        },

        // Creates a render ready type container from WinRT ad object.
        // @params:
        //  ad - WinRT Advertisement object.
        _createBannerContainer: function (ad) {
            var adContainer = new MicrosoftNSJS.Advertising.BannerContainer(MicrosoftNSJS.Advertising.AdContainer.TYPE.UNIVERSAL);
            adContainer.onEngagedChanged = function () { this._processEngagedChanged(); }.bind(this);
            adContainer.onPointerDown = function (msg) { this._firePointerDown(msg); }.bind(this);
            adContainer.onPointerUp = function () { this._firePointerUp(); }.bind(this);
            adContainer.onPointerMove = function (evt) { this._firePointerMove(evt); }.bind(this);
            adContainer.onMouseWheel = function (evt) { this._fireMouseWheel(evt); }.bind(this);
            adContainer.onManipulationStateChanged = function (evt) { this._fireManipulationStateChanged(evt); }.bind(this);
            adContainer.onError = function (error, errorCode) {
                if (this._isDisposed)
                    return;

                // If the ad reports an error, it means it could not initialize or render, so remove the frame.
                // XAML doesn't have this logic. To be parity with XAML.
                //if (this._adContainer) {
                //    this._adContainer.dispose();
                //    this._adContainer = null;
                //}

                if (!errorCode) {
                    errorCode = MicrosoftNSJS.Advertising.AdErrorCode.other;
                }

                if (errorCode.error && errorCode.enum) {
                    this._adController.fireErrorOccurred(error, errorCode.error, errorCode.enum);
                }
                else {
                    this._adController.fireErrorOccurred(error, errorCode);
                }
            }.bind(this);

            adContainer.onAdContainerLoaded = function (args) {
                this._adContainerLoaded_Handler(args, ad);
            }.bind(this);

            adContainer.load({
                "ad": ad, "parentElement": this._domElement, "adTags": this._adController.adTagsJson
            });
        },

        // Handles the ad container content loaded event.
        _adContainerLoaded_Handler: function (args, ad) {
            if (!this._domElement || !args) {
                return;
            }

            var container = args.element;

            if (container.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.ERROR) {
                this._adController.fireErrorOccurred("could not create ad container", MicrosoftNSJS.Advertising.AdErrorCode.other);
                return;
            }

            // Save the old container so we can fade with the new one.
            var adContainerToRemove = this._adContainer;
            this._adContainer = container;

            this._onAdRefreshedInternal = function () {
                if (this._adContainer) {
                    if (adContainerToRemove) {
                        this._adContainer.fadeIn(this._fadeOptions, function () {
                            adContainerToRemove.dispose();
                            adContainerToRemove = null;
                        });
                    } else {
                        this._adContainer.show();
                    }
                }

                this._onAdRefreshedInternal = null;
            }.bind(this);

            if (container.type === MicrosoftNSJS.Advertising.AdContainer.TYPE.UNIVERSAL) {
                // For universal type ads we need to call _fireAdRefreshed in order to let the
                //  ad control know the ad is finished loading.
                this._fireAdRefreshed();
                this._updateApplicationEvents();
            }
        },

        // Restores the ad control to the state it should be in when a new ad is received.
        // This does not remove the ad iframe since we animate the removal of the frame after the
        // new ad iframe is added.
        _resetAdControl: function () {
            this._adInstanceState = null;
        },
        /// sets up ad controller values like width and height
        /// also subscribes to _onErrorFired event to bubble up the _onErrorOccurred event from controller                
        _setupAdController: function () {
            this._adController.adWidth = this._domElement.offsetWidth;
            this._adController.adHeight = this._domElement.offsetHeight;
        },
        _generateUniqueId: function () {
            // Generates an id which is not already in use in the document.
            var generatedId = null;
            var existingElem = null;
            do {
                generatedId = "ad" + Math.floor(Math.random() * 10000);
                existingElem = document.getElementById(generatedId);
            }
            while (existingElem !== null);

            return generatedId;
        },

        _firePointerDown: function (msg) {
            if (typeof (this._onPointerDown) === "function") {
                this._onPointerDown(this, msg);
            }
        },

        _firePointerUp: function () {
            if (typeof (this._onPointerUp) === "function") {
                this._onPointerUp(this);
            }
        },

        _fireEngagedChanged: function () {
            if (typeof (this._onEngagedChanged) === "function") {
                this._onEngagedChanged(this);
            }
        },

        _fireMouseWheel: function (evt) {
            if (typeof (this._onMouseWheel) === "function") {
                this._onMouseWheel(this, evt);
            }
        },

        _firePointerMove: function (evt) {
            if (typeof (this._onPointerMove) === "function") {
                this._onPointerMove(this, evt);
            }
        },

        _fireManipulationStateChanged: function (evt) {
            if (typeof (this._onManipulationStateChanged) === "function") {
                this._onManipulationStateChanged(this, evt);
            }
        },

        _fireAdRefreshed: function () {
            if (this._adContainer && this._adContainer.mraidState !== MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.EXPANDED) {
                if (typeof (this._onAdRefreshedInternal) === "function") {
                    this._onAdRefreshedInternal();
                }
                if (typeof (this._onAdRefreshed) === "function") {
                    this._log("AdControl:_fireAdRefreshed", "_fireAdRefreshed");
                    this._onAdRefreshed(this);
                }
            }
        },

        _fireErrorOccurred: function (errorArgs) {
            if (typeof (this._onErrorOccurred) === "function") {
                this._onErrorOccurred(this, errorArgs);
            }
        },

        _setupEvents: function () {
            try {
                this._onVisibilityChangeHandler = this._onVisibilityChange.bind(this);
                document.addEventListener('visibilitychange', this._onVisibilityChangeHandler);

                var self = this;

                this._mselementresizeHandler = function (e) {
                    this._onResize()
                }.bind(this);

                this._domElement.addEventListener("mselementresize", this._mselementresizeHandler);

                this._resizeHandler = this._onDocumentResize.bind(this);
                window.addEventListener("resize", this._resizeHandler);

                this._domNodeRemovedHandler = function (evt) {
                    if (evt.target === this._domElement) {
                        this.dispose();
                    }
                }.bind(this);
                this._domElement.addEventListener("DOMNodeRemoved", this._domNodeRemovedHandler);

                this._networkChangedEventHandler = function (eventArgs) {
                    if (this._adContainer) {
                        this._adContainer.postMessage({
                            msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETNETWORK + ":" + MicrosoftNSJS.Advertising.AdUtilities.getNetworkState(),
                            all: true
                        });
                    }
                }.bind(this);

                Windows.Networking.Connectivity.NetworkInformation.addEventListener("networkstatuschanged", this._networkChangedEventHandler);

                if (this._adsGlobalEventManager !== null && typeof (this._adsGlobalEventManager) !== "undefined" && this._adsGlobalEventManager.isInitialized === true) {
                    this._globalAdEngagedHandler = this._adsGlobalEventManager.addEventListener(MicrosoftNSJS.Advertising.AdGlobalEventManager.EVENT_TYPE.AD_ENGAGED,
                        function (engagedAdId) {
                            if (self.element !== null && typeof (self.element !== "undefined") && self.element.id !== engagedAdId) {
                                self.suspend();
                            }
                        });
                    this._globalAdDisengagedHandler = this._adsGlobalEventManager.addEventListener(MicrosoftNSJS.Advertising.AdGlobalEventManager.EVENT_TYPE.AD_DISENGAGED,
                         function (disengagedAdId) {
                             if (self.element !== null && typeof (self.element !== "undefined") && self.element.id !== disengagedAdId) {
                                 self.resume();
                             }
                         });
                }
            }
            catch (err) {
                this._log("error on setupEvents: " + (err !== null && typeof (err) === "object" ? err.message : "???", "_setupEvents"));
            }
        },

        // Handles the document size change event on the container bound to ad control.
        _onDocumentResize: function () {
            var screenWidth = document.documentElement.offsetWidth,
                screenHeight = document.documentElement.offsetHeight;

            // Tell ORMMA that the available screen size has changed, so the ad knows how much space is available for expanding.
            if (this._adContainer) {
                this._adContainer.screenSize = {
                    height: screenHeight,
                    width: screenWidth
                };

                // Due to resize, the old expandProperties should be reset to default based on the screen size.
                var expandProperties = this._adContainer.expandProperties;
                expandProperties.width = screenWidth;
                expandProperties.height = screenHeight;
                this._adContainer.expandProperties = expandProperties;

                if (this._adContainer.mraidState === MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.EXPANDED) {
                    this._adContainer.size = {
                        width: expandProperties.width,
                        height: expandProperties.height
                    };
                }
            }
        },

        _onResize: function () {
            var newWidth = this.element.offsetWidth;
            var newHeight = this.element.offsetHeight;
            var currentWidth = this._currentAdWidth;
            var currentHeight = this._currentAdHeight;

            if (newWidth !== currentWidth || newHeight !== currentHeight) {
                this._log("oldWidth:" + currentWidth +
                    " oldHeight:" + currentHeight +
                    " newWidth:" + newWidth +
                    " newHeight: " + newHeight, { fnName: "_onResize" });

                this._currentAdWidth = newWidth;
                this._currentAdHeight = newHeight;

                if (this._adContainer) {
                    this._adContainer.scaleAd(newWidth, newHeight);
                }
            }
        },

        _onVisibilityChange: function () {
            this._log("document visiblity changed:" + document.visibilityState, { fnName: "_onVisibilityChange" });

            if (document.visibilityState === "hidden") {
                this._unscheduleRefresh();
            }
            else if (document.visibilityState === "visible") {
                this._scheduleRefresh();
            }
        },

        _processEngagedChanged: function () {
            if (this._isDisposed)
                return;

            if (this.isEngaged) {
                // // If user is engaged, suspend refresh and broadcast engaged message to global.
                if (this._isAutoRefreshEnabled) {
                    this._unscheduleRefresh();
                }
                window._msAdEngaged = true;
                try {
                    this._adsGlobalEventManager.broadcastEvent(MicrosoftNSJS.Advertising.AdGlobalEventManager.EVENT_TYPE.AD_ENGAGED, this.element.id);
                }
                catch (error) {
                    this._log("Unable to call this._adsGlobalEventManager. Error: {0}", { "err": error, fnName: "_processEngagedChanged" });
                }
            } else {
                // If user is not engaged, allow refresh and broadcast disengaged message to global.
                if (this._isAutoRefreshEnabled) {
                    this._scheduleRefresh();
                }

                window._msAdEngaged = false;
                try {
                    this._adsGlobalEventManager.broadcastEvent(MicrosoftNSJS.Advertising.AdGlobalEventManager.EVENT_TYPE.AD_DISENGAGED, this.element.id);
                }
                catch (error) {
                    this._log("Unable to call this._adsGlobalEventManager. Error: {0}", { "err": error, fnName: "_processEngagedChanged" });
                }
            }

            this._fireEngagedChanged();
        },

        _scheduleRefresh: function () {
            // only schedule a refresh if autorefresh is enabled and not suspended and refresh is not already scheduled
            if (this._isAutoRefreshEnabled && !this._isSuspended && this._refreshTimerId === null) {

                // if current ad is expanded, we should not schedule refresh.
                // Refresh will be scheduled when ad closes.
                if (this._adContainer && this._adContainer.mraidState === MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.EXPANDED) {
                    return;
                }

                var self = this;
                this._refreshTimerId = setTimeout(function () {
                    // clear out the timer id since the timer is done
                    self._refreshTimerId = null;
                    self._refreshInternal();
                }, this._refreshIntervalSec * 1000);
            }
        },

        _unscheduleRefresh: function () {
            if (this._refreshTimerId !== null) {
                clearTimeout(this._refreshTimerId);
                this._refreshTimerId = null;
            }
        },

        // returns false if validation fails
        _validateParameters: function () {
            if (this._adController.adUnitId === null || this._adController.adUnitId === "") {
                this._adController.fireErrorOccurred("ad control requires adUnitId property to be set", MicrosoftNSJS.Advertising.AdErrorCode.clientConfiguration);
                return false;
            }

            // otherwise good (other validation occurs in core library)
            return true;
        },

        _isElementAllowed: function (element) {

            if (element !== null && typeof (element) === "object" && typeof (element.tagName) === "string") {

                var tagName = element.tagName.toLowerCase();
                if (tagName === "button" ||
                    tagName === "menu" ||
                    tagName === "ol" ||
                    tagName === "textarea" ||
                    tagName === "ul" ||
                    tagName === "canvas" ||
                    tagName === "embed" ||
                    tagName === "html" ||
                    tagName === "iframe" ||
                    tagName === "img" ||
                    tagName === "input" ||
                    tagName === "select" ||
                    tagName === "video" ||
                    tagName === "a") {
                    // don't allow creation of ad in these tags as it
                    // impacts rendering of the ad
                    return false;
                }

                return true;
            }

            // if element is null, or not an html element of some-sort return false
            return false;
        },

        _log: function (msg, args) {
            
        },
    };

    MicrosoftNSJS.Advertising.AdControl.OBJECT_NAME = "MicrosoftNSJS.Advertising.AdControl";
    MicrosoftNSJS.Advertising.AdControl._minRefreshIntervalSec = 30;

})();

/*!
  Copyright (C) Microsoft. All rights reserved.
  This library is supported for use in Windows Store apps only.
*/
(function () {
    "use strict";

    if (typeof (MicrosoftNSJS) === "undefined") {
        Object.defineProperty(window, "MicrosoftNSJS", { value: {}, writable: false, enumerable: true, configurable: true });
    }
    if (typeof (MicrosoftNSJS.Advertising) === "undefined") {
        Object.defineProperty(MicrosoftNSJS, "Advertising", { value: {}, writable: false, enumerable: true, configurable: true });
    }

    /// <summary>Glabal event manager instantiated and used by all ad controls to communicate between each other.</summary>
    MicrosoftNSJS.Advertising.AdContainer = function (type) {
        this._name = "AdContainer";
        if (!type || !MicrosoftNSJS.Advertising.AdContainer.TYPE[type.toUpperCase()]) {
            this._log("Incorrect container type specified.", { fnName: "AdContainer()" });
            this.state = MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.ERROR;
        }
        else {
            this._type = type;
            this.state = MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.INITIALIZED;
        }

        this._size = { width: 0, height: 0 };
        this._maxSize = { width: 0, height: 0 };
        this._screenSize = { width: 0, height: 0 };
        // default value of expandProperties.
        this._expandProperties = {
            width: document.documentElement.offsetWidth,
            height: document.documentElement.offsetHeight,
            x: 0,
            y: 0,
            useCustomClose: false,
        };

        this._mraidController = new MicrosoftNSJS.Advertising.MraidController(this);
    };

    MicrosoftNSJS.Advertising.AdContainer.prototype = {
        onAdContainerLoaded: null,

        onEngagedChanged: null,
        onPointerDown: null,
        onPointerUp: null,
        onPointMove: null,
        onMouseWheel: null,
        onManipulationStateChanged: null,
        onError: null,
        onStateChanged: null,

        // MRAID state of the ad container. Will be communicated to the container.
        get mraidState() { return this._mraidState; },
        set mraidState(value) {
            if (value && this._mraidState !== value) {
                var args = {
                    oldState: this._mraidState,
                    newState: value,
                };
                this._mraidState = value;
                this.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETSTATE + ":" + value });
            }
        },

        // Internal state of the ad container.
        get state() { return this._state; },
        set state(value) {
            if (value && this._state !== value) {
                var args = {
                    oldState: this._state,
                    newState: value,
                };
                this._state = value;

                if (typeof (this.onStateChanged) === "function") {
                    this.onStateChanged(args);
                }
            }
        },

        get isEngaged() {
            return this._isUserEngaged;
        },
        set isEngaged(value) {
            if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.EXPANDED) {
                // When ad is expanded, UserEnaged value will be ignored.
                value = true;
            }

            if (this._isUserEngaged !== value) {
                this._isUserEngaged = value;
                if (typeof (this.onEngagedChanged) === "function") {
                    this.onEngagedChanged();
                }
            }
        },

        // Sets/gets and communicates the new screen size to the ad container if supplied value is different.
        // @params
        //  size:{width, height, forceUpdate}
        //      .width:integer - new width
        //      .height:integer - new height
        //      .forceUpdate:bool - causes the property to be updated regardless if it has changed or not
        get screenSize() { return this._screenSize; },
        set screenSize(value) {
            if (value) {
                if (value.height < 0) { value.height = 0; }
                if (value.width < 0) { value.width = 0; }

                if (value.forceUpdate || this._screenSize.width !== value.width || this._screenSize.height !== value.height) {
                    this._screenSize = { height: value.height, width: value.width };
                    this.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETSCREENSIZE + ":" + JSON.stringify(this._screenSize) });
                }
            }
        },

        // Sets/gets and communicates the new size to the ad container if supplied value is different. Will cause resize events to fire.
        // @params
        //  size:{width, height, forceUpdate}
        //      .width:integer - new width
        //      .height:integer - new height
        //      .forceUpdate:bool - causes the property to be updated regardless if it has changed or not
        get size() { return this._size; },
        set size(value) {
            if (value) {

                // Due to a bug with the webview we cannot set size to 0 (this results in a weird delay). The Windows bug tracking this is
                //  BLUE: 620145. Due to this the minimum allowed size for the webview control is 1x1.
                if (value.height < 1) { value.height = 1; }
                if (value.width < 1) { value.width = 1; }

                if (value.forceUpdate || this._size.width !== value.width || this._size.height !== value.height) {
                    this._size = { width: value.width, height: value.height };

                    if (!this._expandedContainer_DOM) {
                        this._viewContainer_DOM.style.width = this._size.width + "px";
                        this._viewContainer_DOM.style.height = this._size.height + "px";
                    }

                    this.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETSIZE + ":" + JSON.stringify(this._size) });
                }
            }
        },

        // Sets/gets and communicates the maximum size the ad container can resize to.
        // @params
        //  size:{width, height, forceUpdate}
        //      .width:integer - new width
        //      .height:integer - new height
        //      .forceUpdate:bool - causes the property to be updated regardless if it has changed or not
        get maxSize() { return this._maxSize; },
        set maxSize(value) {
            if (value) {
                // Due to a bug with the webview we cannot set size to 0 (this results in a weird delay). The Windows bug tracking this is
                //  BLUE: 620145. Due to this the minimum allowed size for the webview control is 1x1.
                if (value.height < 1) { value.height = 1; }
                if (value.width < 1) { value.width = 1; }

                if (value.forceUpdate || this._maxSize.width !== value.width || this._maxSize.height !== value.height) {
                    this._maxSize = { height: value.height, width: value.width };
                    this.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETMAXSIZE + ":" + JSON.stringify(this._maxSize) });
                }
            }
        },

        // Gets the original ad size. This is set by the first call to the size property and should not be modified thereafter.
        get originalProperties() { return this._originalProperties; },

        // Sets and gets the expanded properties, cause the ad container to resize to these properties and notify the ad itself.
        // @params
        //  expandProperties:{width, height, x, y}
        //      .width:number - the new container width
        //      .height:number - the new container height
        //      .x:number - the new style.left parameter
        //      .y:number - the new style.top parameter
        set expandProperties(value) {
            if (value) {
                // Due to a bug with the webview we cannot set size to 0 (this results in a weird delay). The Windows bug tracking this is
                //  BLUE: 620145. Due to this the minimum allowed size for the webview control is 1x1.
                if (value.height < 1) { value.height = 1; }
                if (value.width < 1) { value.width = 1; }

                // Set x/y default to 0 if it is 'undefined'.
                if (!value.y) { value.y = 0; }
                if (!value.x) { value.x = 0; }

                if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.EXPANDED) {
                    this._overlayDiv_DOM.style.width = value.width + "px";
                    this._overlayDiv_DOM.style.height = value.height + "px";

                    this._overlayDiv_DOM.style.top = value.y + "px";
                    this._overlayDiv_DOM.style.left = value.x + "px";
                }

                this._expandProperties = value;
                this.useCustomClose = value.useCustomClose;
            }
        },
        get expandProperties() {
            return this._expandProperties;
        },

        get useCustomClose() {
            return this._expandProperties && this._expandProperties.useCustomClose;
        },
        set useCustomClose(value) {
            if (this._expandProperties) {
                this._expandProperties.useCustomClose = value;
            }

            if (this._overlayClose) {
                this._overlayClose.isVisible = !value;
            }

            // It is not a goal to support interstitial poly ads.
            // For interstitial poly ads, useCustomClose will be set later after creating overlayDiv.
            // We need to consider to dynamic add/remove closeBtn in that case.
        },

        // Returns the current parent control element.
        get parentElement() { return this._parentElement_DOM; },

        // Returns the view container element
        get viewContainer() { return this._viewContainer_DOM; },

        // Returns the current container type. This can only be set through a constructor.
        get type() { return this._type; },

        // The original anchor owner of this container.
        // Used when expanded is called with the url paramter and another ad container needs to be created.
        // Null if the same container is being used for expansion (no url param) or the ad is in .
        //anchorAdContainer: null,

        _MAX_ERROR_REPORT: 20,
        _MAX_ERROR_REPORT_MESSAGE: "error reporting maximum reached, no more errors will be reported",

        _isPoly: false,
        _name: null,
        _errorReportCount: 0,
        _viewContainer_DOM: null,
        _expandedContainer_DOM: null,
        _overlayDiv_DOM: null,
        _overlayClose: null,
        _parentElement_DOM: null,
        _id: null,
        _mraidState: null,
        _isUserEngaged: false,
        _type: null,
        _state: null,
        _size: null,
        _maxSize: null,
        _screenSize: null,
        // Expansion properties.
        _expandProperties: null,
        // The original size of the ad. This can only be set once through the size variable setter. {width:x, height:x}
        _originalProperties: null,
        // adTags need to passed to ad.
        _adTags: null,

        _mraidController: null,

        _onAdMessageReceived: null,

        // Loads ad into the new AdContainer and wires up message
        // @params
        //   options: { parentElement, ad, adTags }
        load: function (options) {
            if (!options || typeof (options) !== "object") {
                this._log("Options parameter is empty.", { fnName: "create" });
                return;
            }

            try {
                this._log("AdContainer:load:s", "load");
                var ad = options.ad;
                this._isPoly = ad.isPoly;
                var parentElement = options.parentElement;

                MicrosoftNSJS.Advertising.AdUtilities.loadResourceFile(MicrosoftNSJS.Advertising.AdContainer.ORMMA_RESOURCE_INDEX).then(function (ormmaResult) {

                    MicrosoftNSJS.Advertising.AdUtilities.loadResourceFile(MicrosoftNSJS.Advertising.AdContainer.BOOTSTRAPJS_RESOURCE_INDEX).then(function (bootstrapResult) {

                        MicrosoftNSJS.Advertising.AdUtilities.loadResourceFile(MicrosoftNSJS.Advertising.AdContainer.BOOTSTRAP_RESOURCE_INDEX).then(
                            function (bootstrapHtml) {
                                // When loading the bootstrap.html file as a resource the BOM is preserved in the 
                                // the returned string which causes a white band at the top of the rendered ad.
                                bootstrapHtml = bootstrapHtml.trim();

                                // Create the ad container and load ad payload into it along side the bootstrap contents.
                                // For MRAID/RR type ads this has to be done as one load because of ad payloads
                                //  containing document.write() statements that have to be executed during the 
                                //  loading phase of the page load lifecycle.
                                var platform = "w8";
                                if (MicrosoftNSJS.Advertising.AdUtilities.isPhone()) {
                                    platform = "wp8";
                                }

                                var payload = this._removeMraidReferencesFromPayload(ad.payloadContent);
                                var sourceHtml = bootstrapHtml.replace("$(PAYLOAD)", payload);
                                sourceHtml = sourceHtml.replace("$(PLATFORM)", platform);
                                sourceHtml = sourceHtml.replace(/\$\(BOOTSTRAPZOOMSTYLE\)/g, Microsoft.Advertising.Shared.WinRT.PlatformDependency.getBootstrapZoomStyle());
                                sourceHtml = sourceHtml.replace("$(BOOTSTRAPJS)", ormmaResult);
                                sourceHtml = sourceHtml.replace("$(ORMMA)", bootstrapResult);

                                this.create({
                                    sourceHTML: sourceHtml,
                                    parentElement: parentElement,
                                    adTags: options.adTags,
                                });

                                if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.ERROR) {
                                    this._fireError("Unable to create ad container");
                                    return;
                                }
                            }.bind(this),
                            function loadBootstrapHtmlErrorHandler(error) {
                                this._log("Could not read bootstrap file. Error='{0}'", { fnName: "load", err: error });
                                this._fireError("Unable to load ad into container.");
                            }.bind(this)
                        );
                    }.bind(this),
                    function loadBootstrapJsErrorHandler(bootstrapResultError) {
                        this._log("Unable to load ad into container. Error:{0}", { fnName: "load", err: bootstrapResultError });
                    }.bind(this));
                }.bind(this),
                function loadOrmmaErrorHandler(ormmaResultError) {
                    this._log("Unable to load ad into container. Error:{0}", { fnName: "load", err: ormmaResultError });
                }.bind(this));

                this._log("AdContainer:load:e", "load");
            }
            catch (err) {
                this._log("Unable to load ad into container. Error:{0}", { fnName: "load", err: err });
            }
        },

        // Creates a new ad container and wires up messaging.
        // @params
        //  options:{parentElement, containerId,  sourceHTML, adTags}
        create: function (options) {
            if (this._state !== MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.INITIALIZED) {
                this._log("Ad container is not in correct state, expected=initialized, actual=" + this._state + ".", { fnName: "create" });
                return;
            }

            if (!options || typeof (options) !== "object") {
                this._log("Options parameter is empty.", { fnName: "create" });
                return;
            }

            try {
                this._log("AdContainer:create:s", "create");
                if (options.containerId) {
                    this._id = options.containerId;
                }
                else {
                    this._id = options.parentElement.id + "_webFrame_" + (+new Date())
                }

                // Create the element and set basic static properties.
                this._parentElement_DOM = options.parentElement;
                this._size = { width: this._parentElement_DOM.offsetWidth, height: this._parentElement_DOM.offsetHeight };
                this._adTags = options.adTags;
                var viewContainer = null;
                if (window._msAdsWebViewPool && window._msAdsWebViewPool.length > 0) {
                    viewContainer = window._msAdsWebViewPool.shift();
                    this._log("AdContainer:create:_msAdsWebViewPool.shift(). #WebViews:" + window._msAdsWebViewPool.length, { fnName: "create" });
                }
                else {
                    viewContainer = document.createElement("x-ms-webview");
                    this._log("AdContainer:create:create x-ms-webview", { fnName: "create" });
                }
                viewContainer.id = this._id;
                viewContainer.frameBorder = 0;
                viewContainer.marginwidth = 0;
                viewContainer.marginheight = 0;
                viewContainer.style.position = "absolute";
                viewContainer.style.visibility = "hidden";
                viewContainer.style.backgroundColor = "transparent";
                viewContainer.style.opacity = 0;
                viewContainer.title = MicrosoftNSJS.Advertising.AdContainer.STRINGS.WEBVIEW_TITLE;

                this._viewContainer_DOM = viewContainer;
                this._setupEvents();

                // Set the container source and update state.
                if (options.sourceHTML) {
                    this.state = MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.LOADING;
                    viewContainer.navigateToString(options.sourceHTML);
                }
                else {
                    this._log("sourceHTML must be specified.", { fnName: "create" });
                    this.state = MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.ERROR;
                    return;
                }

                this.mraidState = MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.LOADING;

                // Set the original properties.
                this._originalProperties = {
                    width: this._parentElement_DOM.offsetWidth,
                    height: this._parentElement_DOM.offsetHeight,
                    y: this._parentElement_DOM.style.top,
                    x: this._parentElement_DOM.style.left,
                    zIndex: this._parentElement_DOM.style.zIndex,
                    position: this._parentElement_DOM.style.position,
                    marginLeft: this._parentElement_DOM.style.marginLeft,
                    marginTop: this._parentElement_DOM.style.marginTop,
                };

                // Append to DOM and set local properties.
                this._parentElement_DOM.appendChild(viewContainer);
                this._log("AdContainer:Create:e", { fnName: "create" });
            }
            catch (err) {
                this._log("Unable to create view container. Error:{0}", { fnName: "create", err: err });
            }
        },

        // Removes the current view container from it's parent.
        remove: function () {
            try {
                if (this._viewContainer_DOM && this._parentElement_DOM && this._viewContainer_DOM.parentNode === this._parentElement_DOM) {
                    this._parentElement_DOM.removeChild(this._viewContainer_DOM);
                }

                if (this._viewContainer_DOM && this._overlayDiv_DOM && this._viewContainer_DOM.parentNode === this._overlayDiv_DOM) {
                    this._overlayDiv_DOM.removeChild(this._viewContainer_DOM);
                }

                this._cleanupViewContainer();

                if (this._overlayDiv_DOM && this._overlayDiv_DOM.parentElement === document.body) {
                    document.body.removeChild(this._overlayDiv_DOM);
                }
            }
            catch (err) {
                this._log("Unable to remove view container. Error:{0}", { fnName: "remove", err: err });
                this.state = MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.ERROR;
                return;
            }

            this._log("Ad container elements removed from DOM.", { fnName: "remove" });
            this.state = MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.REMOVED;
        },

        // Gracefully disposes of the current instance.
        dispose: function () {
            if (this._state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DISPOSED) {
                this._log("Ad container already disposed.", { fnName: "dispose" });
                return;
            }

            if (this._state !== MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.REMOVED) {
                this.remove();
            }

            this.state = MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DISPOSED;
            this.isEngaged = false;
            this._cleanupCloseEvents();
            this._mraidController.dispose();
            this._mraidController = null;

            this.onAdContainerLoaded = null;
            this.onEngagedChanged = null;
            this.onPointerDown = null;
            this.onPointerUp = null;
            this.onPointMove = null;
            this.onMouseWheel = null;
            this.onManipulationStateChanged = null;
            this.onError = null;
            this.onStateChanged = null;
            this._onAdMessageReceived = null;
            this._onUnknownMessage = null;
            this._webViewScriptNotify = null;
            this._webViewNavigationStarting = null;
            this._webViewNavigationCompleted = null;

            this._viewContainer_DOM = null;
            this._expandedContainer_DOM = null;
            this._parentElement_DOM = null;
            if (this._overlayClose) {
                this._overlayClose.dispose();
                this._overlayClose = null;
            }
            this._id = null;
            this._mraidState = null;
            this._size = null;
            this._maxSize = null;
            this._screenSize = null;
            this._expandProperties = null;
            this._originalProperties = null;
            this._adTags = null;

            this._log("Ad container disposed.", { fnName: "dispose" });
        },

        // Suspends the current ad container. Communicates to ad if the ad type supports it.
        suspend: function () {
            if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.SUSPENDED) {
                this._log("Cannot suspend. Ad container already suspended.", { fnName: "suspend" });
                return;
            }

            this.state = MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.SUSPENDED;
        },

        // Resumes the current ad container. Communicates to ad if the ad type supports it.
        resume: function () {
            if (this.state !== MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.SUSPENDED) {
                this._log("Cannot resume. Ad container not currently suspended.", { fnName: "resume" });
                return;
            }

            this.state = MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DEFAULT;
        },

        // Shows the current ad container.
        show: function () {
            if (this._state !== MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DEFAULT) {
                this._log("Unable to show container in current state. State: ." + this.state, { fnName: "show" });
                return;
            }

            this._viewContainer_DOM.style.opacity = 1;
            this._viewContainer_DOM.style.visibility = "inherit";
            this.mraidState = MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.DEFAULT;

            this._log("View container set to visible.", { fnName: "show" });
        },

        // Posts a message to the DOM ad container.
        // @params
        //  options:{msg, [receiveFunctionName], [all]}
        //   .msg:string - message to post
        //   .receiveFunctionName - name of the JavaScript function inside the ad container to call with the message
        //                          defaults to 'receiveMessageString'
        //   .all - if provided will post the message to all current ad DOM containers
        postMessage: function (options) {
            if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DISPOSED) {
                return;
            }

            if (!options || typeof (options) !== "object") {
                this._log("Options parameter is empty.", { fnName: "postMessage" });
                return;
            }

            if (!options.msg || options.msg === "") {
                this._log("Options.msg parameter is empty. Nothing to send", { fnName: "postMessage" });
                return;
            }

            if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.LOADING ||
                this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.EXPANDING) {
                this._log("Cannot post message. Control is in " + this.state + " state. msg=" + options.msg, { fnName: "postMessage" });
                return;
            }

            var receiveFunctionName = options.receiveFunctionName || "receiveMessageString",
                op,
                target = "anchor";

            // target=expanded only applies if we are expanded and expanded into a separate container, otherwise
            //  messages should be sent to the main container
            if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.EXPANDED && this._expandedContainer_DOM) {
                target = "expanded";
            }

            try {
                if (target === "anchor" || options.all) {
                    if (this._viewContainer_DOM) {
                        op = this._viewContainer_DOM.invokeScriptAsync(receiveFunctionName, options.msg);
                        op.oncomplete = function (e) {
                            this._log("InvokeScriptAsync mainContainer SUCCESS msg=" + options.msg + "", { fnName: "postMessage" });
                        }.bind(this);
                        op.onerror = function (e) {
                            this._log("InvokeScriptAsync mainContainer ERROR msg=" + options.msg + "", { fnName: "postMessage" });
                        }.bind(this);
                        op.start();
                    }
                }

                if (target === "expanded" || options.all) {
                    if (this._expandedContainer_DOM) {
                        op = this._expandedContainer_DOM.invokeScriptAsync(receiveFunctionName, options.msg);
                        op.oncomplete = function (e) {
                            this._log("InvokeScriptAsync expandedContainer SUCCESS msg=" + options.msg + "", { fnName: "postMessage" });
                        }.bind(this);
                        op.onerror = function (e) {
                            this._log("InvokeScriptAsync expandedContainer ERROR msg=" + options.msg + "", { fnName: "postMessage" });
                        }.bind(this);
                        op.start();
                    }
                }
            }
            catch (err) {
                this._log("InvokeScriptAsync Error:{0}", { fnName: "postMessage", err: err });
            }
        },

        // Returns whether the ad container is viewable or not.
        isViewable: function () {
            if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DISPOSED) {
                return;
            }

            if (document.visibilityState === "hidden") {
                return false;
            }

            var opacity;

            try {
                if (!this._viewContainer_DOM || !this._viewContainer_DOM.style) {
                    return false;
                }

                opacity = parseInt(this._viewContainer_DOM.style.opacity, 10);
                if (isNaN(opacity)) {
                    opacity = 0;
                }

                return (this.isOnScreen() && opacity === 1);
            }
            catch (err) {
                this._log("Could not determine if ad container is viewable. Error thrown [{0}]", { fnName: "isViewable", err: err });
                return false;
            }
        },

        // Returns whether the ad container and it's parent element are viewable within a set fraction on the current screen.
        isOnScreen: function () {
            if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DISPOSED) {
                return false;
            }

            if (this._parentElement_DOM === null ||
                this._parentElement_DOM.offsetWidth === 0 ||
                this._parentElement_DOM.offsetHeight === 0 ||
                this._viewContainer_DOM.offsetWidth === 0 ||
                this._viewContainer_DOM.offsetHeight === 0 ||
                MicrosoftNSJS.Advertising.AdUtilities.isDomElementHidden(this._parentElement_DOM)) {
                return false;
            }

            var adRect = {};
            try {
                adRect = this._parentElement_DOM.getBoundingClientRect();
            }
            catch (err) {
                // getBoundingClientRect throws "unspecified error" if _domElement is not in DOM
                this._log("getBoundingClientRect error thrown. [{0}]", { fnName: "isOnScreen", err: err });
                return false;
            }

            var boundsX = document.documentElement.offsetWidth;
            var boundsY = document.documentElement.offsetHeight;

            var x = adRect.left;
            var y = adRect.top;

            var visibleX = this._parentElement_DOM.offsetWidth;
            var visibleY = this._parentElement_DOM.offsetHeight;

            if (x < 0) {
                visibleX = Math.max(0, x + visibleX);
            } else if (x + visibleX > boundsX) {
                visibleX = Math.max(0, boundsX - x);
            }

            if (y < 0) {
                visibleY = Math.max(0, y + visibleY);
            } else if (y + visibleY > boundsY) {
                visibleY = Math.max(0, boundsY - y);
            }

            var totalArea = Math.max(1, this._parentElement_DOM.offsetWidth * this._parentElement_DOM.offsetHeight);
            var visibleArea = visibleX * visibleY;

            return (visibleArea / totalArea) >= (1 - MicrosoftNSJS.Advertising.AdContainer.FRACTION_ALLOWED_OFFSCREEN);
        },

        expand: function (url) {
            // abstraction implementation.
        },

        // Closes the ad. Depending on the current ad state a different action willl be taken. See MRAID spec for details.
        close: function () {
            if (this.mraidState === MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.HIDDEN) {
                return;
            }
            else if (this.mraidState === MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.EXPANDED) {
                this._closeExpandView();
            }
            else if (this.mraidState === MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.DEFAULT) {
                this._viewContainer_DOM.style.visibility = "hidden";
                this.mraidState = MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.HIDDEN;
            }
            else if (this.mraidState === MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.RESIZED) {
                this.size = { "width": this.originalProperties.width, "height": this.originalProperties.height };
                this.mraidState = MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.DEFAULT;
            }
        },

        _closeExpandView: function () {
            // abstraction implementation
        },

        // Reports an error to the adContainer
        // @params
        //  action:string - the action that resulted in error
        //  message:string - error message
        reportError: function (action, message) {
            if (this._errorReportCount < this._MAX_ERROR_REPORT) {
                this._log("Reporting error to ad container. Action:" + action + " , Message: " + message, { fnName: "reportError" });
                this._errorReportCount++;
                message = this._errorReportCount >= this._MAX_ERROR_REPORT ? this._MAX_ERROR_REPORT_MESSAGE : message;

                this.postMessage({
                    msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ERROR + ":" + JSON.stringify({ action: action, message: message }),
                    all: true
                });
            }

            if (typeof (this._fireError) === 'function') {
                this._fireError(action, MicrosoftNSJS.Advertising.AdErrorCode.mraidOperationFailure);
            }
        },

        // Takes in a mraid payload and replaces any occurrence of "script src='mraid.js'" with
        // "script src=''". This is to prevent a script exception when loading the payload.            
        _removeMraidReferencesFromPayload: function (payload) {
            var regexFunc = function (match, n1, n2, n3) {
                return n1 + n3;
            };
            return payload.replace(/(<script.*src=[\"'])(mraid.js)([\"'])/gi, regexFunc);
        },

        // Generates the overlay div. Call this inside a try/catch block only.
        _createOverlayDiv: function () {
            var overlayDiv = document.createElement('div');
            overlayDiv.id = this._id + "overlayDiv";
            overlayDiv.style.top = this._expandProperties.y + "px";
            overlayDiv.style.left = this._expandProperties.x + "px";
            overlayDiv.style.zIndex = MicrosoftNSJS.Advertising.AdContainer.EXPANDED_AD_ZINDEX;
            overlayDiv.style.position = "absolute";
            overlayDiv.style.width = this._expandProperties.width + "px";
            overlayDiv.style.height = this._expandProperties.height + "px";
            overlayDiv.marginwidth = 0;
            overlayDiv.marginheight = 0;
            overlayDiv.frameBorder = 0;

            var closeBtnVisible = (this._expandProperties && !this._expandProperties.useCustomClose);
            // If useCustomClose==false, show close button.
            // If useCustomClose==true, reserve transparent close area for MRAID ads but not for polymorphic ads.
            if (closeBtnVisible || !this._isPoly) {
                var closeDiv = this._createCloseButton();
                overlayDiv.appendChild(closeDiv.element);
                this._overlayClose = closeDiv;
            }
            return overlayDiv;
        },

        _createCloseButton: function () {
            var options = {
                id: this._id + "_closeDiv",
                isVisible: (this._expandProperties && !this._expandProperties.useCustomClose),
            };
            var closeBtn = new MicrosoftNSJS.Advertising.AdCloseButton(null, options);

            // set closeDiv to be positioned to top-right
            closeBtn.element.style.top = "0px";
            closeBtn.element.style.right = "0px";
            closeBtn.element.style.left = "";

            closeBtn.onClick = function (args) {
                this.close();
            }.bind(this);

            return closeBtn;
        },

        _setupCloseEvents: function () {
            // abstract implementation
        },

        _cleanupCloseEvents: function () {
            // abstract implementation
        },

        _fireError: function (error, errorCode) {
            if (typeof (this.onError) === "function") {
                this.onError(error, errorCode);
            }
        },

        _setupEvents: function () {
            // Wire events.
            this._webViewScriptNotify = function (args) { this._viewScriptNotify_Handler(args); }.bind(this);
            this._viewContainer_DOM.addEventListener("MSWebViewScriptNotify", this._webViewScriptNotify);
            this._webViewNavigationStarting = function (args) { this._viewContainerNavigationStarting_Handler(args); }.bind(this);
            this._viewContainer_DOM.addEventListener("MSWebViewNavigationStarting", this._webViewNavigationStarting);

            // The following two events both need to be wired. The handler will take the responsibility of de-douping if both happen to fire by
            //  checking the current state. These are required due to some ads loading an additional iFrame for the ad in which case
            //  MSWebViewNavigationCompleted does not execute for an extremely long period of time (10 minutes or more) if at all. In this case
            //  the MSWebViewFrameNavigationCompleted does fire as soon as the content inside the iFrame is loaded.
            this._webViewNavigationCompleted = function (args) { this._viewNavigationCompleted_Handler(args); }.bind(this);
            this._viewContainer_DOM.addEventListener("MSWebViewNavigationCompleted", this._webViewNavigationCompleted);
            this._viewContainer_DOM.addEventListener("MSWebViewFrameNavigationCompleted", this._webViewNavigationCompleted);
        },

        // Receives the dom element message and processes it to pass along to listener.
        _viewScriptNotify_Handler: function (args) {
            if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DISPOSED) {
                return;
            }

            this._log("Message received from ad container. Message:'" + args.value + "'", { fnName: "_viewScriptNotify_Handler" });

            if (typeof (this._onAdMessageReceived) === "function") {
                this._onAdMessageReceived({ "containerId": this._id, "data": args.value, "timeStamp": args.timeStamp });
            }
        },

        // Receives the dom element message and processes it to pass along to listener.
        _viewNavigationCompleted_Handler: function (args) {
            if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DISPOSED) {
                return;
            }

            if (this._state !== MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.LOADING) {
                this._log("View container navigation occured in incorrect state. Expected: " +
                    MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.LOADING +
                    ", Actual: " + this._state +
                    ".", { fnName: "_viewNavigationCompleted_Handler" });

                return;
            }

            this.state = MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DEFAULT;
            this._initializeOrmma();
            this.mraidState = MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.DEFAULT;

            this._log("View container navigation complete.", { fnName: "_viewNavigationCompleted_Handler" });

            if (typeof (this.onAdContainerLoaded) === "function") {
                this.onAdContainerLoaded({ "containerId": this._id, "timeStamp": args.timeStamp, "element": this });
            }
        },

        // Handles the navigating event from web view. Cancels web view navigation and instead calls Launcher.launchUriAsync functionality.
        _viewContainerNavigationStarting_Handler: function (args) {
            if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DISPOSED) {
                return;
            }

            // If the container is still loading, do not intercept navigation events.
            if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.LOADING ||
                this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.EXPANDING ||
                !args) {
                return;
            }

            try {
                // webview.stop() is not the correct call as it will only stop download/loading of elements inside the webview itself (scripts,
                //  resources, etc).
                // preventDefault() is the correct call to make in order to cancel top-level document navigation.
                args.preventDefault();
                this._log("View container navigation stopped.", { fnName: "_viewContainerNavigationStarting_Handler" });

                if (MicrosoftNSJS.Advertising.AdUtilities.isValidLaunchUri(args.uri)) {
                    var uri = new Windows.Foundation.Uri(args.uri);
                    Windows.System.Launcher.launchUriAsync(uri);
                    this._log("View container navigation redirected. Uri:'" + args.uri + "'", { fnName: "_viewContainerNavigationStarting_Handler" });
                }
                else {
                    throw "URI Scheme not allowed.";
                }
            }
            catch (error) {
                this._log("View container navigation handler error. Error: {0}", { err: error, fnName: "_viewContainerNavigationStarting_Handler" });
            }
        },

        // Initializes the ORMMA/MRAID apis in the appropriate ad container.
        // ScreenSize, Locale, network, sdkInfo, tilt/shake capabilities has been initialized in WebView.
        // At the last, it will fire "ready" event to the ad.
        _initializeOrmma: function () {
            if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DISPOSED) {
                return;
            }

            var locale = "undefined",
                isAccelerometerPresent = false;

            this.screenSize = {
                height: document.documentElement.offsetHeight,
                width: document.documentElement.offsetWidth
            };

            try {
                locale = Windows.Globalization.ApplicationLanguages.languages[0];
            }
            catch (error) {
                this._log("Unable to init locale. Error={0}", { err: error, fnName: "initializeOrmma" });
            }

            var networkState = MicrosoftNSJS.Advertising.AdUtilities.getNetworkState();
            var sdkInfo = MicrosoftNSJS.Advertising.AdUtilities.getSdkInfo();

            this.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETLOCALE + ":" + locale });
            this.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETNETWORK + ":" + networkState });
            this.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETSDKINFO + ":" + JSON.stringify(sdkInfo) });

            // set capabilities for shake and tilt
            try {
                isAccelerometerPresent = Windows.Devices.Sensors.Accelerometer.getDefault() !== null;
            }
            catch (err) {
                this._log("Could not detect accelerometer. Error={0}", { err: err, fnName: "initializeOrmma" });
            }

            this.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETCAPABILITY + ":" + JSON.stringify({ capability: "tilt", value: isAccelerometerPresent }) });
            this.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETCAPABILITY + ":" + JSON.stringify({ capability: "shake", value: isAccelerometerPresent }) });

            // Universal payload no longer has adParameters and prmParameters.
            //if (ad.adParameters !== "") {
            //    adContainer.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ADPARAMS + ":" + this._rendererParams })
            //}
            //if (ad.prmParameters !== "") {
            //    adContainer.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_PRMPARAMS + ":" + this._prmParams })
            //}

            // The adTags from app side need to be passed into ad.
            if (this._adTags && this._adTags !== "") {
                this.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_APPPARAMS + ":" + this._adTags })
            }

            // ORMMA_START will invoke ORMMA.init() and fire "ready" event.
            this.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_START });
            // TODO: INIT doesn't do anything in bootstrap.js.
            this.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_INIT });
        },

        _cleanupViewContainer: function () {
            if (this._viewContainer_DOM) {
                try {
                    this._viewContainer_DOM.removeEventListener("MSWebViewScriptNotify", this._webViewScriptNotify);
                    this._viewContainer_DOM.removeEventListener("MSWebViewNavigationStarting", this._webViewNavigationStarting);
                    this._viewContainer_DOM.removeEventListener("MSWebViewNavigationCompleted", this._webViewNavigationCompleted);
                    this._viewContainer_DOM.removeEventListener("MSWebViewFrameNavigationCompleted", this._webViewNavigationCompleted);

                    if (window._msAdsWebViewPool) {

                        // WebView and GC have an issue which will force GC on the UI thread when cleaning up the resources (Script engine).
                        // That will result in a performance issue when destorying AdControl.
                        // The work around is to delay the resources to be cleaned up. So we don't clean up resources here.
                        // When the WebView being re-used, navigate to next ad will clean up the resources.
                        // this._viewContainer_DOM.navigateToString('');
                        window._msAdsWebViewPool.push(this._viewContainer_DOM);
                        this._log("AdContainer:CleanupViewContainer:WebView pushed. #WebViews:" + window._msAdsWebViewPool.length, { fnName: "_cleanupViewContainer" });
                    };
                }
                catch (error) {
                    this._log("Unable to cleanup WebView. Error: {0}", { err: error, fnName: "_cleanupViewContainer" });
                }
            }
        },

        // Basic logging function. Implementation will be taken out by minifier.
        _log: function (msg, args) {
            
        }
    };

    MicrosoftNSJS.Advertising.AdContainer.BOOTSTRAP_RESOURCE_INDEX = "Files/Microsoft.Advertising/bootstrap.html";

    MicrosoftNSJS.Advertising.AdContainer.BOOTSTRAPJS_RESOURCE_INDEX = "Files/Microsoft.Advertising/bootstrap.js";

    MicrosoftNSJS.Advertising.AdContainer.ORMMA_RESOURCE_INDEX = "Files/Microsoft.Advertising/ormma.js";

    MicrosoftNSJS.Advertising.AdContainer.FRAMEWORK_RESOUCE_MAP = "Microsoft.Advertising.JavaScript";

    MicrosoftNSJS.Advertising.AdContainer.BASE_ELEMENT_TEMPLATE = "<base href='{url}'>"; // HTML base tag does not a closing counterpart.

    MicrosoftNSJS.Advertising.AdContainer.FRACTION_ALLOWED_OFFSCREEN = 0.5;

    // Calibrated values for drawing Close Button
    MicrosoftNSJS.Advertising.AdContainer.CLOSE_BUTTON_CONSTANTS = {
        CLOSE_BUTTON_SIZE: 46,
        CLOSE_BUTTON_COORD_SMALL: 17,
        CLOSE_BUTTON_COORD_BIG: 33,
        CLOSE_BUTTON_STROKE_THICKNESS: 4,
    };
    // MRAID 2.0 defines the Close Area to be 50*50  
    MicrosoftNSJS.Advertising.AdContainer.CLOSE_AREA_CONSTANTS = {
        CLOSE_AREA_WIDTH: 50,
        CLOSE_AREA_HEIGHT: 50
    };

    // Container type. key must === value for exists[value] validations in code.
    MicrosoftNSJS.Advertising.AdContainer.TYPE = {
        UNIVERSAL: "UNIVERSAL",
    };

    MicrosoftNSJS.Advertising.AdContainer.STRINGS = {
        "WEBVIEW_TITLE": "Advertisement"
    };

    MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE = {
        // MRAID 1.0
        LOADING: "loading",
        DEFAULT: "default",
        EXPANDED: "expanded",
        HIDDEN: "hidden",

        // MRAID 2.0 (future)
        RESIZED: "resized"
    };

    MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE = {
        ERROR: "error",
        INITIALIZED: "initialized",
        LOADING: "loading",
        DEFAULT: "default",
        EXPANDING: "expanding",
        EXPANDED: "expanded",
        REMOVED: "removed",
        DISPOSED: "disposed",
        SUSPENDED: "suspended"
    };

    // The max z-index value is 2147483647 (if you set it higher, it will be lowered to this value anyway).
    // For the expanded ad, put it at z-index of (max - 10), so that it will be very high, but app can still
    // put a dialog on top of it if needed.
    MicrosoftNSJS.Advertising.AdContainer.EXPANDED_AD_ZINDEX = 2147483647 - 10;

    // messages types sent to web compartment
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ADPARAMS = "adParams";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_PRMPARAMS = "prmParams";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_APPPARAMS = "appParams";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_INIT = "init";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_START = "ormmaStart";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETMAXSIZE = "setMaxSize";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETSCREENSIZE = "setScreenSize";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETSIZE = "setSize";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETSTATE = "setState";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_FIRESHAKE = "fireShake";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_UPDATETILTCOORDS = "updateTiltCoords";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_UPDATEORIENTATION = "updateOrienation";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETNETWORK = "setNetwork";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETLOCALE = "setLocale";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETSDKINFO = "setSdkInfo";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETCAPABILITY = "setCapability";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_WIREAPPEVENTS = "wireAppEvents";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETFOCUS = "setFocus";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETPLACEMENTTYPE = "setPlacementType";

    // messages types received from web compartment
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ADRENDERED = "rendered";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_OPEN = "web";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_EXPAND = "expand";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_CLOSE = "close";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_RESIZE = "resize";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_HIDE = "hide";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SHOW = "show";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETEXPANDPROPERTIES = "setexpandproperties";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETUSERENGAGED = "setuserengaged";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_TILT = "tilt";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SHAKE = "shake";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_LISTENER = "listener";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VALUESTART = "start";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VALUESTOP = "stop";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_GETTILT = "gettilt";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_GETORIENTATION = "getorientation";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_REFRESH = "refresh";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_REQUEST = "request";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_USECUSTOMCLOSE = "usecustomclose";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ONPOINTERDOWN = "MSPointerDown";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ONPOINTERUP = "MSPointerUp";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ONMOUSEWHEEL = "MSMouseWheel";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ONPOINTERMOVE = "MSPointerMove";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ONMANIPSTATECHANGED = "MSManipulationStateChanged";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_LOGAPIUSAGE = "logapiusage";

    // messages types received from and sent to web compartment
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VIEWABLECHANGE = "viewableChange";
    MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ERROR = "error";



    /// <summary>
    /// The communication bridge between AdContainer and mraid.js.
    /// </summary>
    MicrosoftNSJS.Advertising.MraidController = function (adContainer) {
        this._adContainer = adContainer;
        this._adContainer._onAdMessageReceived = this._receiveMessage.bind(this);
        if (this._accelerometer) {
            this._accelerometer.reportInterval = this._AccelerometerIntervalMS;
        }

        // ormma response handling instructions (request api/response event)
        this._ORMMA_RESPONSE_IGNORE = "ignore";
        this._ORMMA_RESPONSE_PROXY = "proxy";

        // Headers for the ormma request method
        this._HTTP_HEADER_CACHE_CONTROL = "cache-control";
        this._HTTP_HEADER_VALUE_CACHE_CONTROL_NO_CACHE = "no-cache";

        this._viewableChangedTimer = null;
        this._hasViewablility = false;
        this._viewableCheckPeriodMs = 500;
        this._orientationChangedHandler = null;
        this._accelerometer = Windows.Devices.Sensors.Accelerometer.getDefault();
        this._AccelerometerIntervalMS = 50;
        this._tiltListener = null;
        this._shakeListener = null;
        this._lastCoords = { x: 0, y: 0, z: 0 };
    };

    MicrosoftNSJS.Advertising.MraidController.prototype = {
        dispose: function () {
            this._stopViewableChangeMonitoring();
            this._stopOrientationMonitoring();
            this._stopShakeAccelerometer();
            this._stopShakeAccelerometer();
            this._accelerometer = null;
            this._adContainer = null;
        },

        _receiveMessage: function (msg) {
            try {
                // pull the msg type from the string
                var msgType = null;
                var msgParams = null;
                var colonIx = msg.data.indexOf(":");
                if (colonIx < 0) {
                    msgType = msg.data;
                } else {
                    msgType = msg.data.substr(0, colonIx);
                    msgParams = msg.data.substr(colonIx + 1);
                }

                if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_EXPAND) {
                    try {
                        var props = JSON.parse(msgParams);
                        this._expand(props.url);
                    }
                    catch (err) {
                        this._reportError(MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_EXPAND, "unable to parse expand properties as json");
                    }
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_CLOSE) {
                    this._close();
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETEXPANDPROPERTIES) {
                    this._updateExpandProperties(msgParams);
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_USECUSTOMCLOSE) {
                    this._updateUseCustomClose(msgParams);
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETUSERENGAGED) {
                    this._processSetUserEngaged(msgParams);
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ADRENDERED) {
                    // The smooth transition feature is only for Poly. Due to universal payload change,
                    // AdSDK cannot differentiate Poly ads, Mrigankka decide to disable this feature. 
                    //control._fireAdRefreshed();
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_TILT) {
                    this._processTiltMessage(msgParams);
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SHAKE) {
                    this._processShakeMessage(msgParams);
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_GETORIENTATION) {
                    this._processGetOrientationMessage(msgParams);
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ERROR) {
                    this._fireOnError(msgParams);
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_RESIZE) {
                    this._resize(msgParams);
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_HIDE) {
                    this._hide();
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SHOW) {
                    this._show();
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_OPEN) {
                    this._processOpenMessage(msgParams);
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_REQUEST) {
                    this._request(JSON.parse(msgParams));
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VIEWABLECHANGE) {
                    this._processViewableChangeMessage(msgParams);
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ONPOINTERDOWN) {
                    this._firePointerDown(JSON.parse(msgParams));
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ONPOINTERUP) {
                    this._firePointerUp();
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ONMOUSEWHEEL) {
                    this._fireMouseWheel(JSON.parse(msgParams));
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ONPOINTERMOVE) {
                    this._firePointerMove(JSON.parse(msgParams));
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_ONMANIPSTATECHANGED) {
                    this._fireManipulationStateChanged(JSON.parse(msgParams));
                } else if (msgType === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_LOGAPIUSAGE) {
                    // no-op
                } else {
                    if (this._adContainer && typeof (this._adContainer._onUnknownMessage) === "function") {
                        // Add a test hook to handle test code communication.
                        this._adContainer._onUnknownMessage(msg);
                    } else {
                        this._reportError("unknown", "unknown action");
                    }
                }
            }
            catch (err) {
                // There is an unexpected error from the ad communication. We should ignore it.
                this._log(err, "_receiveMessage");
            }
        },

        // Updates the new expand properties
        // @params
        //  newExpandProps:{width,height,useCustomClose,lockOrientation,isModal}
        //   .width:number - new expand width
        //   .height:number - new expand height
        //   .useCustomClose:bool - if true, the SDK will not provide close functionality
        //   .lockOrientation:bool - currently not implemented
        //   .isModal:bool - ignored, all expansions result in modal windows
        // MRAID 1.0 Spec - Controlling expandProperties - http://www.iab.net/media/file/IABMRAIDVersionOnefinal.pdf
        // At a minimum, the following properties should be supported.
        // properties object properties = {
        // "useBackground" : "true|false",
        // "backgroundColor" : "#rrggbb",
        // "backgroundOpacity" : "n.n",
        // "lockOrientation" : "true|false"
        // }
        _updateExpandProperties: function (newExpandProps) {
            var expandProps;

            if (!this._adContainer) {
                this._log("Unable to update expand properties, adContainer missing.", { fnName: "_updateExpandProperties" });
                return;
            }

            try {
                expandProps = JSON.parse(newExpandProps);
            }
            catch (err) {
                // report the error back to the renderer/ormma
                this._reportError(MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETEXPANDPROPERTIES, "unable to parse expand properties as json");
                return; // json format is invalid, cannot perform update
            }

            this._adContainer.expandProperties = expandProps;
        },

        _updateUseCustomClose: function (useCustomClose) {
            if (useCustomClose === "true" || useCustomClose === true) {
                useCustomClose = true;
            }
            else if (useCustomClose === "false" || useCustomClose === false) {
                useCustomClose = false;
            }

            this._adContainer.useCustomClose = useCustomClose;
        },

        // Expands the current ad container
        // @params
        //  url - location to expand to. In poly case this is loaded as the only source in new container.
        //        in mraid case this triggers the use of a new webview for expand.
        _expand: function (url) {
            if (!this._adContainer) {
                this._log("Unable to expand, adContainer missing.", { fnName: "_expand" });
                return;
            }

            if (this._adContainer._viewContainer_DOM !== document.activeElement) {
                this._log("User has not interacted with the creative, cannot expand.", { fnName: "_expand" });
                return;
            }

            try {
                this._adContainer.expand(url);
            }
            catch (error) {
                this._log("Unable to expand. Error: {0}", { "err": error, fnName: "_expand" });
            }
        },

        _processSetUserEngaged: function (msgStr) {
            if (msgStr === null || msgStr.indexOf("=") === -1) {
                this._log("invalid setUserEngaged message: " + msgStr);
            } else {
                var msgArray = msgStr.split("=");
                if (msgArray[0] === "engaged") {
                    var isUserEngaged = (msgArray[1] === "true");
                    this._adContainer.isEngaged = isUserEngaged;
                } else {
                    this._log("invalid setUserEngaged message: " + msgStr);
                }
            }
        },

        _resize: function (msgParams) {
            if (this._adContainer) {
                if (this._adContainer.mraidState === MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.DEFAULT) {
                    var resizeProps = JSON.parse(msgParams);
                    var width = resizeProps.width;
                    var height = resizeProps.height;

                    if (width === null || height === null || width === "" || height === "" || isNaN(width + height)) {
                        this._reportError("resize", "invalid width or height supplied");
                        return;
                    }

                    if (this._adContainer.originalProperties.width === width && this._adContainer.originalProperties.height === height) {
                        this._adContainer.size = { "height": height, "width": width };
                        this._adContainer.mraidState = MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.DEFAULT;
                    }
                    else {
                        this._adContainer.size = { "height": height, "width": width };
                        this._adContainer.mraidState = MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.RESIZED;
                    }
                } else {
                    this._reportError("resize", "state is not default, current state is:" + this._adContainer.mraidState);
                }
            }
        },

        _hide: function () {
            if (this._adContainer) {
                if (this._adContainer.mraidState === MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.DEFAULT) {
                    this._adContainer.close();
                } else {
                    this._reportError("hide", "state is not default, current state is:" + this._adContainer.mraidState);
                }
            }
        },

        _show: function () {
            if (this._adContainer) {
                if (this._adContainer.mraidState === MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.HIDDEN) {
                    this._adContainer.show();
                } else {
                    this._reportError("show", "state is not hidden, current state is:" + this._adContainer.mraidState);
                }
            }
        },

        _close: function () {
            if (!this._adContainer) {
                return;
            }

            this._adContainer.close();
        },

        // Processes the ormma/mraid open message.
        _processOpenMessage: function (msgStr) {
            var data = null;

            try {
                data = JSON.parse(msgStr)

                if (MicrosoftNSJS.Advertising.AdUtilities.isValidLaunchUri(data.url)) {
                    var uri = new Windows.Foundation.Uri(data.url);
                    Windows.System.Launcher.launchUriAsync(uri);
                }
                else {
                    this._reportError("open", "unable to open URL");
                }
            } catch (err) {
                this._reportError("open", "unable to open URL");
            }
        },

        _request: function (data) {
            if (MicrosoftNSJS.Advertising.AdUtilities.getNetworkState() === MicrosoftNSJS.Advertising.AdUtilities.NETWORK_OFFLINE) {
                this._reportError(MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_REQUEST, "http request error, network offline");
                return;
            }

            try {
                var self = this;
                var req = new XMLHttpRequest;

                // If "display" param is ignore, the response does not get handled or sent back
                if (data.display.toLowerCase() !== this._ORMMA_RESPONSE_IGNORE) {
                    req.onreadystatechange = function () {
                        if (this.readyState === XMLHttpRequest.DONE) {
                            if (this.status === 200) {
                                var responseJSON = { url: escape(data.url), response: escape(this.responseText) };

                                if (self._adContainer) {
                                    self._adContainer.postMessage({
                                        msg: "ormmaResponse:" + JSON.stringify(responseJSON),
                                        all: true
                                    });
                                }
                            } else {
                                self._reportError(MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_REQUEST, "error on request to url: " + data.url + ": code " + req.status);
                            }
                        }
                    };
                }

                req.open("GET", data.url, true);
                req.setRequestHeader(this._HTTP_HEADER_CACHE_CONTROL, this._HTTP_HEADER_VALUE_CACHE_CONTROL_NO_CACHE);
                req.timeout = 10000;

                req.send(null);
            }
            catch (e) {
                this._reportError(MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_REQUEST, "http request error: " + e.message);
            }
        },

        _processTiltMessage: function (msgStr) {
            if (msgStr === null || msgStr.indexOf("=") === -1) {
                this._log("invalid tilt message: " + msgStr);
            } else {
                var msgArray = msgStr.split("=");
                if (msgArray[0] === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_LISTENER) {
                    if (msgArray[1] === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VALUESTART) {
                        this._startTiltAccelerometer();
                    } else if (msgArray[1] === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VALUESTOP) {
                        this._stopTiltAccelerometer();
                    } else {
                        this._log("invalid tilt message: " + msgStr);
                    }
                } else if (msgArray[0] === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_GETTILT && msgArray[1] === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_REFRESH) {
                    this._getTilt();
                } else {
                    this._log("invalid tilt message: " + msgStr);
                }
            }
        },

        _startTiltAccelerometer: function () {
            if (this._accelerometer) {
                try {
                    if (!this._tiltListener) {
                        this._tiltListener = function (eventArgs) {
                            var coords = this._generateCoordsMessage(eventArgs.reading.accelerationX, eventArgs.reading.accelerationY, eventArgs.reading.accelerationZ);

                            if (this._adContainer) {
                                this._adContainer.postMessage({
                                    msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_UPDATETILTCOORDS + ":{" + coords + "}",
                                    all: true
                                });
                            }
                        }.bind(this);

                        this._accelerometer.addEventListener("readingchanged", this._tiltListener());
                    }
                }
                catch (err) {
                }
            }
        },

        _generateCoordsMessage: function (x, y, z) {
            return '"x":"' + x + '","y":"' + y + '","z":"' + z + '"';
        },

        _stopTiltAccelerometer: function () {
            try {
                if (typeof (this._tiltListener) === "function") {
                    this._accelerometer.removeEventListener("readingchanged", this._tiltListener);
                    this._tiltListener = null;
                }
            }
            catch (err) {
                this._log("could not stop the tilt accelerometer");
            }
        },

        _getTilt: function () {
            if (this._accelerometer) {
                try {
                    var coords = this._lastCoords;
                    var strCoords = this._generateCoordsMessage(coords.x, coords.y, coords.z);

                    if (this._adContainer) {
                        this._adContainer.postMessage({
                            msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_UPDATETILTCOORDS + ":{" + strCoords + "}",
                            all: true
                        });
                    }

                    var reading = this._accelerometer.device.getCurrentReading();
                    this._lastCoords = { x: reading.accelerationX, y: reading.accelerationY, z: reading.accelerationZ };
                }
                catch (err) {
                    this._log("error in getTilt");
                }
            }
        },

        _processShakeMessage: function (msgStr) {
            if (msgStr === null || msgStr.indexOf("=") === -1) {
                this._log("invalid shake message: " + msgStr);
            } else {
                var msgArray = msgStr.split("=");
                if (msgArray[0] === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_LISTENER) {
                    if (msgArray[1] === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VALUESTART) {
                        this._startShakeAccelerometer();
                    } else if (msgArray[1] === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VALUESTOP) {
                        this._stopShakeAccelerometer();
                    } else {
                        this._log("invalid shake message: " + msgStr);
                    }
                } else {
                    this._log("invalid shake message: " + msgStr);
                }
            }
        },

        _startShakeAccelerometer: function () {
            if (this._accelerometer) {
                // only ad if this requesting ad instance does not already have a listener.
                try {
                    if (!this._shakeListener) {
                        this._shakeListener = function (eventArgs) {
                            if (this._adContainer) {
                                this._adContainer.postMessage({
                                    msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_FIRESHAKE,
                                    all: true
                                });
                            }
                        }.bind(this);

                        this._accelerometer.addEventListener("shaken", this._shakeListener);
                    }
                }
                catch (err) {
                    this._log("could not start the shake accelerometer");
                }
            }
        },

        _stopShakeAccelerometer: function () {
            try {
                if (typeof (this._shakeListener) === "function") {
                    this._accelerometer.removeEventListener("shaken", this._shakeListener);
                    this._shakeListener = null;
                }
            }
            catch (err) {
                this._log("could not stop shake accelerometer");
            }
        },

        _processGetOrientationMessage: function (msgStr) {
            // GetOrientation will be called and resolved directly inside the iFrame (will not bubble to here),
            // only bubble event wiring to the ad control since we cannot subscribe to the MSOrientationChange event inside the iFrame.
            if (msgStr !== null && msgStr.indexOf("=") !== -1) {
                var msgArray = msgStr.split("=");
                if (msgArray[0] === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_LISTENER) {
                    if (msgArray[1] === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VALUESTART) {
                        this._startOrientationMonitoring();
                    } else if (msgArray[1] === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VALUESTOP) {
                        this._stopOrientationMonitoring();
                    } else {
                        this._log("invalid orientation message: " + msgStr);
                    }
                } else {
                    this._log("invalid orientation message: " + msgStr);
                }
            }
        },

        _startOrientationMonitoring: function () {
            try {
                if (typeof (this._orientationChangedHandler) !== "function") {
                    this._orientationChangedHandler = function (evt) {
                        this._updateOrienation();
                    }.bind(this);

                    Windows.Graphics.Display.DisplayProperties.addEventListener("orientationchanged", this._orientationChangedHandler);
                }
            }
            catch (err) {
                this._reportError(MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_UPDATEORIENTATION, "Unable to communicate with orientation sensor.");
            }
        },

        _stopOrientationMonitoring: function () {
            try {
                if (typeof (this._orientationChangedHandler) === "function") {
                    Windows.Graphics.Display.DisplayProperties.removeEventListener("orientationchanged", this._orientationChangedHandler);
                    this._orientationChangedHandler = null;
                }
            }
            catch (err) {
                this._reportError(MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_UPDATEORIENTATION, "Unable to communicate with orientation sensor.");
            }
        },

        _updateOrienation: function () {
            var orientation = -1;

            // convert the orientation to the ormma value
            try {
                switch (Windows.Graphics.Display.DisplayProperties.currentOrientation) {
                    case Windows.Graphics.Display.DisplayOrientations.landscape:
                        orientation = 270;
                        break;
                    case Windows.Graphics.Display.DisplayOrientations.landscapeFlipped:
                        orientation = 90;
                        break;
                    case Windows.Graphics.Display.DisplayOrientations.portraitFlipped:
                        orientation = 180;
                        break;
                    case Windows.Graphics.Display.DisplayOrientations.portrait:
                        orientation = 0;
                        break;
                    default:
                        orientation = -1;
                        break;
                }

                // update the value of orientation in ormma
                if (this._adContainer) {
                    this._adContainer.postMessage({
                        msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_UPDATEORIENTATION + ":" + JSON.stringify({ orientation: orientation }),
                        all: true
                    });
                }
            }
            catch (err) {
                control._reportError(MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_UPDATEORIENTATION, "Unable to communicate with orientation sensor.");
            }
        },

        _processViewableChangeMessage: function (msgStr) {
            if (msgStr === null || msgStr.indexOf("=") === -1) {
                this._log("invalid viewable change message: " + msgStr);
            } else {
                var msgArray = msgStr.split("=");
                if (msgArray[0] === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_LISTENER) {
                    if (msgArray[1] === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VALUESTART) {
                        this._startViewableChangeMonitoring();
                    } else if (msgArray[1] === MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VALUESTOP) {
                        this._stopViewableChangeMonitoring();
                    } else {
                        this._log("invalid viewable change message: " + msgStr);
                    }
                } else {
                    this._log("invalid viewably change message: " + msgStr);
                }
            }
        },

        _startViewableChangeMonitoring: function () {
            // Start monitoring as soon as it is requested. The adContainer might not be created yet, however some ads seem to call this functionality
            //  before mraid is set to default state (still in loading state). As soon as the adContainer is created the events will start firing
            //  and ads will start getting notified.
            if (this._viewableChangedTimer === null) {
                this._adContainer && this._adContainer.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VIEWABLECHANGE + ":" + JSON.stringify({ viewable: this._adContainer.isViewable() }) });

                this._viewableChangedTimer = window.setInterval(function () {
                    var onScreen = this._adContainer && this._adContainer.isViewable();
                    if (this._hasViewablility !== onScreen) {
                        this._hasViewablility = onScreen;
                        this._adContainer && this._adContainer.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VIEWABLECHANGE + ":" + JSON.stringify({ viewable: onScreen }) });
                    }
                }.bind(this), this._viewableCheckPeriodMs);
            }

            // fire the event immediately with the current viewable state
            if (this._adContainer) {
                this._hasViewablility = this._adContainer.isViewable();
                this._adContainer.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_VIEWABLECHANGE + ":" + JSON.stringify({ viewable: this._hasViewablility }) });
            }
        },

        _stopViewableChangeMonitoring: function () {
            if (this._viewableChangedTimer !== null && typeof (this._viewableChangedTimer) === "number") {
                window.clearInterval(this._viewableChangedTimer);
                this._viewableChangedTimer = null;
            }
        },

        _fireOnError: function (error) {
            this._adContainer._fireError(error, MicrosoftNSJS.Advertising.AdErrorCode.creativeError);
        },

        _firePointerDown: function (msg) {
            if (typeof (this._adContainer.onPointerDown) === "function") {
                this._adContainer.onPointerDown(msg);
            }
        },

        _firePointerUp: function () {
            if (typeof (this._adContainer.onPointerUp) === "function") {
                this._adContainer.onPointerUp();
            }
        },

        _fireMouseWheel: function (evt) {
            if (typeof (this._adContainer.onMouseWheel) === "function") {
                this._adContainer.onMouseWheel(evt);
            }
        },

        _firePointerMove: function (evt) {
            if (typeof (this._adContainer.onPointerMove) === "function") {
                this._adContainer.onPointerMove(evt);
            }
        },

        _fireManipulationStateChanged: function (evt) {
            if (typeof (this._adContainer.onManipulationStateChanged) === "function") {
                this._adContainer.onManipulationStateChanged(evt);
            }
        },

        // Reports an error to the adContainer
        // @params
        //  action:string - the action that resulted in error
        //  message:string - error message
        _reportError: function (action, message) {
            if (!this._adContainer) {
                this._log("Unable to report error, adContainer missing", { fnName: "_reportError" });
                return;
            }

            this._adContainer.reportError(action, message);
        },

        // Basic logging function. Implementation will be taken out by minifier.
        _log: function (msg, args) {
            
        }
    };

})();
/*!
  Copyright (C) Microsoft. All rights reserved.
  This library is supported for use in Windows Store apps only.
*/
(function () {
    "use strict";

    if (typeof (MicrosoftNSJS) === "undefined") {
        Object.defineProperty(window, "MicrosoftNSJS", { value: {}, writable: false, enumerable: true, configurable: true });
    }
    if (typeof (MicrosoftNSJS.Advertising) === "undefined") {
        Object.defineProperty(MicrosoftNSJS, "Advertising", { value: {}, writable: false, enumerable: true, configurable: true });
    }

    /// <summary>Glabal event manager instantiated and used by all ad controls to communicate between each other.</summary>
    MicrosoftNSJS.Advertising.AdGlobalEventManager = function () {

        // Constructor function used to instantiate this type. Will overwrite the window._msAdsGlobalEventManager variable if 
        // it is currently present.
        if (window) {
            if (!window._msAdsGlobalEventManager || !window._msAdsGlobalEventManager.isInitialized) {
                this._isInitialized = true;
                this._eventListeners = null;

                // Set this instance onto the window so we can access it globally.
                window._msAdsGlobalEventManager = this;
            }

            return window._msAdsGlobalEventManager;
        }
    };

    MicrosoftNSJS.Advertising.AdGlobalEventManager.prototype = {
        // Indicates whether the current EventManager instance is initialized or not.
        get isInitialized() {
            return this._isInitialized;
        },

        // Adds a new event listener. Returns the listener if successful, null otherwise.
        // <param name="eventType">The type of event.</param>
        // <param name="listener">Listener to subscribe</param>
        addEventListener: function (eventType, listener) {
            if (this._isNullOrUndefined(eventType) || this._isNullOrUndefined(listener)) {
                this._logError("Could not add listener, eventType or listener null or undefined");
                return;
            }

            try {
                this._initializeEventListenersContainer(eventType);
                this._eventListeners[eventType].push(listener);
                return listener;
            }
            catch (err) {
                this._logError("Could not add listener type '" + eventType + "', exception was thrown [{0}]", err);
                return null;
            }
        },

        // Removes an event listener. Returns the event listener if successful, null otherwise.
        // <param name="eventType">The type of event.</param>
        // <param name="listener">Listener to remove</param>
        removeEventListener: function (eventType, listener) {
            if (this._isNullOrUndefined(eventType) || this._isNullOrUndefined(listener)) {
                this._logError("Could not remove listener, eventType or listener null or undefined.");
                return;
            }

            if (!this._eventArrayExists(eventType)) {
                this._logError("Could not remove listener, no listener found for eventType: " + eventType);
                return null;
            }
            else {
                try {
                    var listeners = this._eventListeners[eventType];
                    for (var i = 0; i < listeners.length; i++) {
                        if (listeners[i] === listener) {
                            var l = listeners.splice(i, 1);
                            return l[0];
                        }
                    }
                }
                catch (err) {
                    this._logError("Could not remove listener, exception was thrown [{0}]", err);
                    return null;
                }
            }
        },

        // Broadcasts the event to all listeners. Args are passed in to the listener function call.
        // <param name="eventType">The type of event.</param>
        // <param name="args">Arguments to pass to the listener function.</param>
        broadcastEvent: function (eventType, args) {
            if (this._isNullOrUndefined(eventType)) {
                this._logError("Could not broadcast event, eventType null or undefined");
                return;
            }

            if (!this._eventArrayExists(eventType)) {
                return;
            }
            else {
                var listeners = this._eventListeners[eventType];
                for (var i = 0; i < listeners.length; i++) {
                    if (!this._isNullOrUndefined(listeners[i])) {
                        listeners[i](args);
                    }
                }
            }
        },

        // This function destroys the AdGlobalEvent manager and unlinks the window._msAdsGlobalEventManager variable if no events exist unless
        // force variable is set to true.
        // <param name="force">Forces the disposal, dangerous!</param>
        dispose: function (force) {
            try {
                if (force === true) {
                    this._dispose();
                    return;
                }

                var eventsLeft = false;
                for (var i in MicrosoftNSJS.Advertising.AdGlobalEventManager.EVENT_TYPE) {
                    if (this._eventArrayExists(MicrosoftNSJS.Advertising.AdGlobalEventManager.EVENT_TYPE[i])
                        && this._eventListeners[MicrosoftNSJS.Advertising.AdGlobalEventManager.EVENT_TYPE[i]].length > 0) {
                        eventsLeft = true;
                        break;
                    }
                }

                if (eventsLeft === false) {
                    this._dispose();
                }
                else {
                    this._logError("Could not dispose, events collection is not empty.");
                }
            }
            catch (err) {
                try {
                    this._logError("Could not dispose, exception thrown [{0}].", err);
                }
                catch (err) {
                    // Nothing left to do if we failed at this point.
                }
            }
        },

        // Private Methods
        _dispose: function () {
            this._eventListeners = null;
            this._isInitialized = false;
            window._msAdsGlobalEventManager = null;
        },

        _initializeEventListenersContainer: function (eventType) {
            if (this._eventListeners === null) {
                this._eventListeners = {};
                this._eventListeners[eventType] = [];
            }
            else if (this._isNullOrUndefined(this._eventListeners[eventType])) {
                this._eventListeners[eventType] = [];
            }
        },

        _eventArrayExists: function (eventType) {
            if (this._eventListeners === null || this._eventListeners[eventType] === null || typeof (this._eventListeners[eventType]) === "undefined") {
                return false;
            }

            return true;
        },

        _isNullOrUndefined: function (object) {
            if (typeof (object) === "undefined" || object === null) {
                return true;
            }

            return false;
        },

        _logError: function (message, err) {
            
        }
    };

    MicrosoftNSJS.Advertising.AdGlobalEventManager.EVENT_TYPE = {
        AD_ENGAGED: "msAdEngaged",
        AD_DISENGAGED: "msAdDisengaged"
    };

})();
/// <loc filename="metadata\ad.xml" format="messagebundle" />
/*!
  Copyright (C) Microsoft. All rights reserved.
*/
(function () {
    "use strict";

    if (typeof (MicrosoftNSJS) === "undefined") {
        Object.defineProperty(window, "MicrosoftNSJS", { value: {}, writable: false, enumerable: true, configurable: true });
    }
    if (typeof (MicrosoftNSJS.Advertising) === "undefined") {
        Object.defineProperty(MicrosoftNSJS, "Advertising", { value: {}, writable: false, enumerable: true, configurable: true });
    }

    MicrosoftNSJS.Advertising.AdErrorCode = {
        unknown: "Unknown",
        noAdAvailable: "NoAdAvailable",
        networkConnectionFailure: "NetworkConnectionFailure",
        clientConfiguration: "ClientConfiguration",
        serverSideError: "ServerSideError",
        invalidServerResponse: "InvalidServerResponse",
        refreshNotAllowed: "RefreshNotAllowed",
        other: "Other",
        creativeError: "CreativeError",
        mraidOperationFailure: "MraidOperationFailure",
        convertToEnum: function (errorCode) {
            if (typeof (Microsoft) === "undefined") {
                return null;
            }
            switch (errorCode) {
                case MicrosoftNSJS.Advertising.AdErrorCode.unknown:
                    return Microsoft.Advertising.ErrorCode.unknown;
                case MicrosoftNSJS.Advertising.AdErrorCode.noAdAvailable:
                    return Microsoft.Advertising.ErrorCode.noAdAvailable;
                case MicrosoftNSJS.Advertising.AdErrorCode.networkConnectionFailure:
                    return Microsoft.Advertising.ErrorCode.networkConnectionFailure;
                case MicrosoftNSJS.Advertising.AdErrorCode.clientConfiguration:
                    return Microsoft.Advertising.ErrorCode.clientConfiguration;
                case MicrosoftNSJS.Advertising.AdErrorCode.serverSideError:
                    return Microsoft.Advertising.ErrorCode.serverSideError;
                case MicrosoftNSJS.Advertising.AdErrorCode.invalidServerResponse:
                    return Microsoft.Advertising.ErrorCode.invalidServerResponse;
                case MicrosoftNSJS.Advertising.AdErrorCode.refreshNotAllowed:
                    return Microsoft.Advertising.ErrorCode.refreshNotAllowed;
                case MicrosoftNSJS.Advertising.AdErrorCode.other:
                    return Microsoft.Advertising.ErrorCode.other;
                case MicrosoftNSJS.Advertising.AdErrorCode.creativeError:
                    return Microsoft.Advertising.ErrorCode.creativeError;
                case MicrosoftNSJS.Advertising.AdErrorCode.mraidOperationFailure:
                    return Microsoft.Advertising.ErrorCode.mraidOperationFailure;
                default:
                    return Microsoft.Advertising.ErrorCode.other;
            }
        }
    };

    MicrosoftNSJS.Advertising.EventManager = function () {
        this._eventListeners = null;
    };

    MicrosoftNSJS.Advertising.EventManager.prototype = {
        // Adds a new event listener. Returns the listener if successful, null otherwise.
        // <param name="eventType">The type of event.</param>
        // <param name="listener">Listener to subscribe</param>
        addEventListener: function (eventType, listener) {
            if (!eventType || !listener || typeof (listener) !== "function") {
                return null;
            }

            eventType = eventType.toLowerCase();

            try {
                this._initializeEventListenersContainer(eventType);
                this._eventListeners[eventType].push(listener);
                return listener;
            }
            catch (err) {
                return null;
            }
        },

        // Removes an event listener. Returns the event listener if successful, null otherwise.
        // <param name="eventType">The type of event.</param>
        // <param name="listener">Listener to remove</param>
        removeEventListener: function (eventType, listener) {
            if (!eventType || !listener) {
                return null;
            }

            eventType = eventType.toLowerCase();

            if (!this._eventArrayExists(eventType)) {
                return null;
            }
            else {
                try {
                    var listeners = this._eventListeners[eventType];
                    for (var i = 0; i < listeners.length; i++) {
                        if (listeners[i] === listener) {
                            var l = listeners.splice(i, 1);
                            return l[0];
                        }
                    }
                }
                catch (err) {
                    return null;
                }
            }
        },

        // Broadcasts the event to all listeners. Args are passed in to the listener function call.
        // <param name="eventType">The type of event.</param>
        // <param name="arg1">First argument to pass to the listener function (may be undefined).</param>
        // <param name="arg2">Second argument to pass to the listener function (may be undefined).</param>
        broadcastEvent: function (eventType, arg1, arg2) {
            if (!eventType) {
                //console.log("could not broadcast event, eventType null or undefined");
                return;
            }

            eventType = eventType.toLowerCase();

            if (this._eventArrayExists(eventType)) {
                var listeners = this._eventListeners[eventType];
                for (var i = 0; i < listeners.length; i++) {
                    if (listeners[i]) {
                        listeners[i](arg1, arg2);
                    }
                }
            }
        },

        dispose: function () {
            this._eventListeners = null;
        },

        _initializeEventListenersContainer: function (eventType) {
            if (this._eventListeners === null) {
                this._eventListeners = {};
                this._eventListeners[eventType] = [];
            }
            else if (!this._eventListeners[eventType]) {
                this._eventListeners[eventType] = [];
            }
        },

        _eventArrayExists: function (eventType) {
            eventType = eventType.toLowerCase();
            return (this._eventListeners && this._eventListeners[eventType]);
        }
    };

    MicrosoftNSJS.Advertising.AdUtilities = {
        MAX_URL_LENGTH: 2048,

        // URI schemes to allow when ad attempts to launch a URI.
        ALLOWED_URI_SCHEMES: {
            "http": "http",
            "https": "https",
            "ms-windows-store": "ms-windows-store",
            "skype": "skype",
            "microsoftmusic": "microsoftmusic",
            "xboxsmartglass": "xboxsmartglass",
            "xboxgames": "xboxgames",
            "microsoftvideo": "microsoftvideo",
            "bingtravel": "bingtravel",
            "bingweather": "bingweather",
            "bingmaps": "bingmaps",
            "bingfinance": "bingfinance",
            "bingsports": "bingsports",
            "bingfoodanddrink": "bingfoodanddrink",
            "binghealthnfitness": "binghealthnfitness",
            "bingnews": "bingnews",
            "tel": "tel"
        },

        NETWORK_OFFLINE: "offline",
        NETWORK_WIFI: "wifi",
        NETWORK_CELL: "cell",
        NETWORK_UNKNOWN: "unknown",

        _WindowPhoneDeviceFamily: "Windows.Mobile",

        _resourceLoaderFrameworkMapName: "Microsoft.Advertising.JavaScript",
        _resourceLoaderNonFrameworkMapName: "Microsoft.Advertising/UIStrings",
        _resourceLoaderPrefix: "Microsoft.Advertising/UIStrings/",
        _resourceLoader: null,
        _isPhone: null,

        isValidLaunchUri: function (u) {
            if (u) {
                try {
                    var uri = new Windows.Foundation.Uri(u);
                    if (u.length <= this.MAX_URL_LENGTH && this.ALLOWED_URI_SCHEMES[uri.schemeName.toLowerCase()]) {
                        return true;
                    }
                }
                catch (err) {
                    // invalid URI string will cause Uri constructor to throw error
                }
            }
            return false;
        },

        // This is used to create the error args for both the errorOccurred event and the
        // error result from a promise.
        _createErrorArgs: function (msg, code) {
            return { errorMessage: msg, errorCode: code };
        },

        hhmmssToSeconds: function (time) {
            if (typeof (time) === "string") {
                // validate only valid characters (colon, period, digits)
                if (!time.match("^[:\.0-9]*$")) {
                    return null;
                }

                var tokens = time.split(":");

                // The time should be in the format "hh:mm:ss.s" so we expect 1 to 3 tokens when split on ":" (hh and mm are optional).
                if (tokens.length === 0 || tokens.length > 3) {
                    return null;
                }

                var seconds = 0;
                switch (tokens.length) {
                    case 3:
                        seconds += parseInt(tokens[tokens.length - 3]) * 60 * 60; //hours
                    case 2:
                        seconds += parseInt(tokens[tokens.length - 2]) * 60; //minutes
                    case 1:
                        seconds += parseFloat(tokens[tokens.length - 1]); //seconds
                }

                // if any of the tokens is not numeric, the result is NaN which we do not want to return
                if (!isNaN(seconds)) {
                    return seconds;
                }
            }
            return null;
        },

        isNetworkMetered: function () {
            var isMetered = false;

            try {
                var connectionProfile = Windows.Networking.Connectivity.NetworkInformation.getInternetConnectionProfile();
                if (connectionProfile !== null) {
                    var currentConnectionCost = connectionProfile.getConnectionCost();
                    isMetered =
                        currentConnectionCost.networkCostType === Windows.Networking.Connectivity.NetworkCostType.fixed ||
                        currentConnectionCost.networkCostType === Windows.Networking.Connectivity.NetworkCostType.variable;
                }
            } catch (err) {
            }

            return isMetered;
        },

        // Determine network state from Windows network API
        getNetworkState: function () {
            try {
                var connProfile = Windows.Networking.Connectivity.NetworkInformation.getInternetConnectionProfile();

                if (!connProfile || connProfile.getNetworkConnectivityLevel() === Windows.Networking.Connectivity.NetworkConnectivityLevel.none) {
                    return this.NETWORK_OFFLINE;
                } else {
                    var interfaceType = connProfile.networkAdapter.ianaInterfaceType;
                    if (interfaceType === 6 /* ethernet network */
                        ||
                        interfaceType === 71 /* 802.11 wireless */) {
                        return this.NETWORK_WIFI; // Note: Ormma doesn't have status value for wired/ethernet so use wifi
                    } else {
                        // Treat connection as cell adapter type
                        return this.NETWORK_CELL;
                    }
                }
            }
            catch (err) {
            }

            return this.NETWORK_UNKNOWN;
        },

        // Async function to read a network file and return it's contents as string using the HttpClient class.
        // @params:
        //  uri: Windows.Foundation.Uri web resource locator
        readNetworkContentsAsync: function (uri) {
            var httpClient;

            return new Promise(function (comp, errorHandler) {
                if (!uri || uri.length === 0) {
                    throw "Missing required uri parameter";
                }

                httpClient = new Windows.Web.Http.HttpClient();
                httpClient.getAsync(uri).then(function (response) {
                    response.ensureSuccessStatusCode(); // will throw and fall to error handler function if response was not successful
                    response.content.readAsStringAsync().then(function (responseText) {
                        comp(responseText);
                    }.bind(this)).done(function () { },
                    function (error) {
                        // handle readAsStringAsync errors
                        errorHandler(error);
                    }.bind(this))
                }.bind(this)).done(function () { },
                    function (error) {
                        // handle getAsync errors
                        errorHandler(error);
                    }.bind(this));
            });
        },

        getSdkInfo: function () {
            try {
                var info = Microsoft.Advertising.Shared.WinRT.SdkInfoProvider.getSdkInfo();
                return { sdkVersion: info.sdkVersion, client: info.client, runtimeType: "WWA" };
            }
            catch (err) {
                return {};
            }
        },

        isPhone: function () {
            if (typeof (this._isPhone) === "boolean") {
                return this._isPhone;
            }

            try {
                this._isPhone = Microsoft.Advertising.Shared.WinRT.PlatformDependency.isMobile();
                return this._isPhone;
            }
            catch (err) {
                return false;
            }
        },

        getLocalizedString: function (resource) {
            if (!this._resourceLoader) {
                // Check if resources are in the framework location.
                this._resourceLoader = Windows.ApplicationModel.Resources.Core.ResourceManager.current.allResourceMaps[this._resourceLoaderFrameworkMapName];
                if (!this._resourceLoader) {
                    // Check if resources are in the main app location.
                    this._resourceLoader = Windows.ApplicationModel.Resources.Core.ResourceManager.current.mainResourceMap.getSubtree(this._resourceLoaderNonFrameworkMapName);
                    this._resourceLoaderPrefix = "";
                }
            }
            if (this._resourceLoader) {
                var resourceCandidate = this._resourceLoader.getValue(this._resourceLoaderPrefix + resource);
                if (resourceCandidate !== null) {
                    return resourceCandidate.valueAsString;
                }
            }
            // if unable to get localized string, return the en-us string that was passed in. 
            return resource;
        },

        removeFromDOM: function (child) {
            try {
                if (child !== null && typeof (child) === "object") {
                    // This reduces memory leak associated with adding/removing iframes from DOM.
                    if (child.nodeName === "IFRAME") {
                        child.removeAttribute("src");
                    }

                    // if the element being removed has a winControl with a dispose function, call it
                    if (child.winControl && child.winControl.dispose) {
                        child.winControl.dispose();
                    }

                    var parentElem = child.parentNode;
                    if (parentElem !== null && typeof (parentElem) === "object") {
                        parentElem.removeChild(child);
                    }
                }
            }
            catch (err) {
            }
        },

        // Traverses the DOM up through parents to identify if the current element is hidden or not.
        isDomElementHidden: function (domElement) {
            var tempElem = domElement;
            while (tempElem !== null && typeof (tempElem) === "object" && tempElem.nodeName !== 'BODY') {
                var vis = typeof (tempElem.style) != "undefined" ? tempElem.style.visibility : "";
                if (vis === "hidden" || vis === "collapse") {
                    return true;
                } else if (vis === 'visible') {
                    // if explicitly set to visible, it doesn't matter what the parent element visibility is, so stop checking hierarchy
                    break;
                } else {
                    // otherwise visibility is set to inherit or blank, so we need to check parent
                    tempElem = tempElem.parentNode;
                }
            }
            return false;
        },

        // Async function to read resource file contents. Return a promise.
        // @params:
        //  resourcePath: path to the file resource
        loadResourceFile: function (resourcePath) {
            return new Promise(function (completed, errorHandler) {

                if (!resourcePath) {
                    errorHandler("resourcePath cannot be undefined.");
                    return;
                }

                var resourceMap = null;
                if (Windows.ApplicationModel.Resources.Core.ResourceManager.current !== null) {
                    // Attempt to Load resources as a framework
                    try {
                        // Get all Resource maps
                        var allMaps = Windows.ApplicationModel.Resources.Core.ResourceManager.current.allResourceMaps;
                        if (allMaps !== null) {
                            // this is for the Framework scenario
                            if (allMaps.hasKey(MicrosoftNSJS.Advertising.AdContainer.FRAMEWORK_RESOUCE_MAP)) {
                                resourceMap = allMaps.lookup(MicrosoftNSJS.Advertising.AdContainer.FRAMEWORK_RESOUCE_MAP);
                            }
                        }
                        if (resourceMap === null) {
                            // this is for the non framework scenario
                            resourceMap = Windows.ApplicationModel.Resources.Core.ResourceManager.current.mainResourceMap;
                        }

                    } catch (err) {
                        errorHandler("An error occurred getting the resource map.");
                        return;
                    }
                }

                if (resourceMap !== null && resourceMap.hasKey(resourcePath)) {
                    var resourceCandidate = resourceMap.getValue(resourcePath, Windows.ApplicationModel.Resources.Core.ResourceContext.getForCurrentView());

                    resourceCandidate.getValueAsFileAsync().then(function (storageFile) {
                        storageFile.openReadAsync().then(function (randomStream) {
                            var bufferSize = randomStream.size;
                            var buffer = new Windows.Storage.Streams.Buffer(bufferSize);
                            randomStream.readAsync(buffer, bufferSize, Windows.Storage.Streams.InputStreamOptions.none).then(function (resultBuffer) {
                                var result = Windows.Security.Cryptography.CryptographicBuffer.convertBinaryToString(Windows.Security.Cryptography.BinaryStringEncoding.utf8, resultBuffer);
                                completed(result);
                            },
                            function (resultBufferError) {
                                errorHandler("Error reading from storage file, resource: " + resourcePath);
                            });
                        },
                        function (randomStreamError) {
                            errorHandler("Error opening storage file for read access, resource: " + resourcePath);
                        });
                    },
                    function (storageFileError) {
                        errorHandler("Error getting storage file, resource: " + resourcePath);
                    });

                } else {
                    errorHandler("Error getting resource, resource: " + resourcePath);
                }
            });
        },

        setOptions: function (control, options) {
            if (typeof options === "object") {
                var keys = Object.keys(options);
                for (var i = 0, len = keys.length; i < len; i++) {
                    var key = keys[i];
                    var value = options[key];
                    if (key.length > 2) {
                        var ch1 = key[0];
                        var ch2 = key[1];
                        if ((ch1 === 'o' || ch1 === 'O') && (ch2 === 'n' || ch2 === 'N')) {
                            if (typeof value === "function") {
                                if (control.addEventListener) {
                                    control.addEventListener(key.substr(2), value);
                                    continue;
                                }
                            }
                        }
                    }
                    control[key] = value;
                }
            }
        },

        // Adds a single class to the element's existing classes.
        addClassToElement: function (elem, className) {
            var existing = elem.className || "";
            var existingList = existing.split(" ");
            if (existingList.indexOf(className) === -1) {
                elem.className = (existing + " " + className).trim();
            }
        },

        // Removes a single class from the element's existing classes.
        removeClassFromElement: function (elem, className) {
            var existing = elem.className || "";
            var existingList = existing.split(" ");
            var match = -1;
            if ((match = existingList.indexOf(className)) !== -1) {
                // the class is present
                existingList.splice(match, 1);
                var newClassName = existingList.join(" ");
                elem.className = newClassName;
            }
        }
    };
    // end AdUtilities

    MicrosoftNSJS.Advertising.AdCloseButton = function (element, options) {
        /// <summary locid="MicrosoftNSJS.Advertising.AdCloseButton">
        ///   Button control to close a full-screen ad.
        /// </summary>
        /// <param name="element" type="HTMLElement" domElement="true" locid="MicrosoftNSJS.Advertising.AdCloseButton_p:element">
        ///   The DOM element to be associated with the AdCloseButton.
        /// </param>
        /// <param name="options" type="object" locid="MicrosoftNSJS.Advertising.AdCloseButton_p:options">
        ///   The set of options to be applied initially to the AdCloseButton.
        /// </param>
        /// <returns type="MicrosoftNSJS.Advertising.AdCloseButton" locid="MicrosoftNSJS.Advertising.AdCloseButton_returnValue">A constructed AdCloseButton.</returns>
        if (!element) {
            element = document.createElement("div");
        }

        element.winControl = this;

        element.style.zIndex = 2147483647; // maximum value
        element.style.position = "absolute";
        element.style.top = "0px";
        element.style.left = "0px";
        element.style.width = MicrosoftNSJS.Advertising.AdCloseButton.areaWidth + "px";
        element.style.height = MicrosoftNSJS.Advertising.AdCloseButton.areaHeight + "px";
        element.className = "adCloseButton";

        // Set div to transparent while child object will still be visible.
        // Setting alpha value (opacity indicator) to 0.01 since setting it to 0 makes div
        // unable to register click events.
        // At 0.01 opacity, it is still invisible though it registers close events.
        element.style.backgroundColor = "rgba(0,0,0,0.01)";

        if (options && options.id) {
            element.id = options.id;
        }

        this._closeCanvas = null;
        this._isVisible = options && options.isVisible;
        if (this._isVisible) {
            var canvas = this._generateButtonCanvas();
            this._closeCanvas = canvas;
            element.appendChild(canvas);
        }

        this._domElement = element;

        this._setupEvents();
    };

    MicrosoftNSJS.Advertising.AdCloseButton.prototype = {
        get onClick() {
            return this._onClick;
        },
        set onClick(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onClick = value;
            }
        },

        /// <field type="boolean" locid="MicrosoftNSJS.Advertising.AdCloseButton.isVisible">
        ///   Whether the button is currently visible.
        /// </field>
        get isVisible() {
            return this._isVisible
        },
        set isVisible(value) {
            if (this.isVisible !== value) {
                this._isVisible = value;
                if (this._isVisible) {
                    if (!this._closeCanvas) {
                        this._closeCanvas = this._generateButtonCanvas();
                    }

                    this._domElement.appendChild(this._closeCanvas);
                }
                else {
                    if (this._closeCanvas) {
                        this._domElement.removeChild(this._closeCanvas);
                    }
                }
            }
        },

        /// <field type="HTMLElement" domElement="true" hidden="true" locid="MicrosoftNSJS.Advertising.AdCloseButton.element">
        ///   The DOM element which is the AdCloseButton
        /// </field>
        get element() {
            return this._domElement;
        },

        dispose: function () {
            if (this._domElement) {
                this._domElement.winControl = null;
                this._domElement.onclick = null;
            }
            this._domElement = null;
            this._closeCanvas = null;
        },

        _setupEvents: function () {
            if (this._domElement) {
                this._domElement.onclick = function (args) {
                    if (this.onClick && typeof (this.onClick) === "function") {
                        this.onClick();
                    }
                }.bind(this);
            }
        },

        // Generates the div that can be clicked to close a full-screen ad.
        //
        // NOTE: Call this inside a try/catch block only.
        _generateButtonCanvas: function () {
            // Render a visible close indicator inside the area if ad is not presenting a close button itself.
            var circleRadius = MicrosoftNSJS.Advertising.AdCloseButton.closeButtonDiameter / 2;
            var closeCoords = {
                x: MicrosoftNSJS.Advertising.AdCloseButton.areaWidth / 2,
                y: MicrosoftNSJS.Advertising.AdCloseButton.areaHeight / 2
            }

            var canvas = document.createElement("canvas");
            var ctx = canvas.getContext("2d");

            // Draw circle for holding x sign

            ctx.beginPath();
            // usage: context.arc(x, y, r, sAngle, eAngle, counterclockwise);
            ctx.arc(closeCoords.x, closeCoords.y, circleRadius, 0, 2 * Math.PI);
            ctx.lineWidth = MicrosoftNSJS.Advertising.AdCloseButton.closeButtonStrokeThickness;
            ctx.strokeStyle = "#FFFFFF";
            ctx.fillStyle = "#000000";
            ctx.fill();
            ctx.stroke();

            // draw x sign

            ctx.moveTo(MicrosoftNSJS.Advertising.AdCloseButton.closeButtonCoordSmall, MicrosoftNSJS.Advertising.AdCloseButton.closeButtonCoordSmall);
            ctx.lineTo(MicrosoftNSJS.Advertising.AdCloseButton.closeButtonCoordBig, MicrosoftNSJS.Advertising.AdCloseButton.closeButtonCoordBig);
            ctx.stroke();

            ctx.moveTo(MicrosoftNSJS.Advertising.AdCloseButton.closeButtonCoordBig, MicrosoftNSJS.Advertising.AdCloseButton.closeButtonCoordSmall);
            ctx.lineTo(MicrosoftNSJS.Advertising.AdCloseButton.closeButtonCoordSmall, MicrosoftNSJS.Advertising.AdCloseButton.closeButtonCoordBig);
            ctx.stroke();

            // set the canvas to transparent while child is visible
            canvas.style.backgroundColor = "rgba(0,0,0,0)";

            return canvas;
        }
    };

    // AdCloseButton static members

    // MRAID 2.0 defines the Close Area to be 50*50  
    MicrosoftNSJS.Advertising.AdCloseButton.areaWidth = 50;
    MicrosoftNSJS.Advertising.AdCloseButton.areaHeight = 50;
    MicrosoftNSJS.Advertising.AdCloseButton.closeButtonDiameter = 46;
    MicrosoftNSJS.Advertising.AdCloseButton.closeButtonCoordSmall = 17;
    MicrosoftNSJS.Advertising.AdCloseButton.closeButtonCoordBig = 33;
    MicrosoftNSJS.Advertising.AdCloseButton.closeButtonStrokeThickness = 4;

    MicrosoftNSJS.Advertising.BackButton = function (element, options) {
        /// <summary locid="MicrosoftNSJS.Advertising.BackButton">
        ///   Button control to close a full-screen ad.
        /// </summary>
        /// <param name="element" type="HTMLElement" domElement="true" locid="MicrosoftNSJS.Advertising.BackButton_p:element">
        ///   The DOM element to be associated with the BackButton.
        /// </param>
        /// <param name="options" type="object" locid="MicrosoftNSJS.Advertising.BackButton_p:options">
        ///   The set of options to be applied initially to the BackButton.
        /// </param>
        /// <returns type="MicrosoftNSJS.Advertising.BackButton" locid="MicrosoftNSJS.Advertising.BackButton_returnValue">A constructed BackButton.</returns>
        if (!element) {
            element = document.createElement("div");
        }

        element.winControl = this;

        element.style.zIndex = 2147483647; // maximum value
        element.style.position = "absolute";
        element.style.top = "0px";
        element.style.left = "0px";
        element.style.width = MicrosoftNSJS.Advertising.BackButton.areaWidth + "px";
        element.style.height = MicrosoftNSJS.Advertising.BackButton.areaHeight + "px";
        element.className = "adBackButton";

        element.style.backgroundColor = "rgba(0,0,0,0)";

        if (options && options.id) {
            element.id = options.id;
        }

        var canvas = this._generateButtonCanvas();
        this._closeCanvas = canvas;
        element.appendChild(canvas);

        this._isVisible = options && options.isVisible;
        if (this._isVisible) {
            element.style.visibility = "visible";
            element.style.opacity = "1";
        } else {
            element.style.visibility = "hidden";
            element.style.opacity = "0";
        }

        element.style.transition = "opacity 0.2s";

        this._domElement = element;

        this._setupEvents();
    };

    MicrosoftNSJS.Advertising.BackButton.prototype = {
        get onClick() {
            return this._onClick;
        },
        set onClick(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onClick = value;
            }
        },


        /// <field type="boolean" locid="MicrosoftNSJS.Advertising.BackButton.isVisible">
        ///   Whether the button is currently visible.
        /// </field>
        get isVisible() {
            return this._isVisible
        },
        set isVisible(value) {
            if (this.isVisible !== value) {
                this._isVisible = value;

                if (value) {
                    if (this._domElement) {
                        this._domElement.style.visibility = "visible";
                    }
                } else {
                    // if setting isVisible=false, make the button hidden after the fade-out so that it will not intercept clicks
                    setTimeout(function () {
                        if (this._domElement) {
                            this._domElement.style.visibility = (this._isVisible ? "visible" : "hidden");
                        }
                    }.bind(this), 200);
                }

                this.element.style.opacity = (value ? 1 : 0);
            }
        },

        /// <field type="HTMLElement" domElement="true" hidden="true" locid="MicrosoftNSJS.Advertising.BackButton.element">
        ///   The DOM element which is the BackButton
        /// </field>
        get element() {
            return this._domElement;
        },

        dispose: function () {
            if (this._domElement) {
                this._domElement.winControl = null;
                this._domElement.onclick = null;
            }
            this._domElement = null;
            this._closeCanvas = null;
        },

        _setupEvents: function () {
            if (this._domElement) {
                this._domElement.onclick = function (args) {
                    if (this.onClick && typeof (this.onClick) === "function") {
                        this.onClick();
                    }
                }.bind(this);
            }
        },

        // Generates the div that can be clicked to close a full-screen ad.
        //
        // NOTE: Call this inside a try/catch block only.
        _generateButtonCanvas: function () {
            // Render a visible close indicator inside the area if ad is not presenting a close button itself.
            var circleRadius = MicrosoftNSJS.Advertising.BackButton.closeButtonDiameter / 2;
            var closeCoords = {
                x: MicrosoftNSJS.Advertising.BackButton.areaWidth / 2,
                y: MicrosoftNSJS.Advertising.BackButton.areaHeight / 2
            }

            var canvas = document.createElement("canvas");
            canvas.width = MicrosoftNSJS.Advertising.BackButton.areaWidth;
            canvas.height = MicrosoftNSJS.Advertising.BackButton.areaHeight;
            var ctx = canvas.getContext("2d");

            // Draw outer circle
            ctx.beginPath();
            ctx.arc(closeCoords.x, closeCoords.y, circleRadius, 0, 2 * Math.PI);
            ctx.lineWidth = MicrosoftNSJS.Advertising.BackButton.closeButtonBorderThickness;
            ctx.strokeStyle = "#FFFFFF";
            ctx.fillStyle = "rgba(0,0,0,0.1)";
            ctx.fill();
            ctx.stroke();

            // draw left arrow
            ctx.beginPath();
            ctx.lineWidth = MicrosoftNSJS.Advertising.BackButton.closeButtonStrokeThickness;

            // arrow point
            ctx.moveTo(MicrosoftNSJS.Advertising.BackButton.arrowPointTopX, MicrosoftNSJS.Advertising.BackButton.arrowPointTopY);
            ctx.lineTo(MicrosoftNSJS.Advertising.BackButton.arrowTipX, MicrosoftNSJS.Advertising.BackButton.arrowTipY);
            ctx.lineTo(MicrosoftNSJS.Advertising.BackButton.arrowPointBottomX, MicrosoftNSJS.Advertising.BackButton.arrowPointBottomY);
            ctx.stroke();

            // arrow shaft
            ctx.moveTo(MicrosoftNSJS.Advertising.BackButton.arrowTipX, MicrosoftNSJS.Advertising.BackButton.arrowTipY);
            ctx.lineTo(MicrosoftNSJS.Advertising.BackButton.arrowShaftEndX, MicrosoftNSJS.Advertising.BackButton.arrowShaftEndY);
            ctx.stroke();

            // set the canvas to transparent while child is visible
            canvas.style.backgroundColor = "rgba(0,0,0,0)";

            return canvas;
        }
    };

    // BackButton static members

    MicrosoftNSJS.Advertising.BackButton.areaWidth = 50;
    MicrosoftNSJS.Advertising.BackButton.areaHeight = 50;

    MicrosoftNSJS.Advertising.BackButton.closeButtonDiameter = 46;
    MicrosoftNSJS.Advertising.BackButton.closeButtonBorderThickness = 2;
    MicrosoftNSJS.Advertising.BackButton.closeButtonStrokeThickness = 4;

    MicrosoftNSJS.Advertising.BackButton.arrowTipX = 15;
    MicrosoftNSJS.Advertising.BackButton.arrowTipY = 25;
    MicrosoftNSJS.Advertising.BackButton.arrowPointTopX = 25;
    MicrosoftNSJS.Advertising.BackButton.arrowPointTopY = 15;
    MicrosoftNSJS.Advertising.BackButton.arrowPointBottomX = 25;
    MicrosoftNSJS.Advertising.BackButton.arrowPointBottomY = 35;
    MicrosoftNSJS.Advertising.BackButton.arrowShaftEndX = 37;
    MicrosoftNSJS.Advertising.BackButton.arrowShaftEndY = 25;

}());

(function () {
    "use strict";

    if (typeof (MicrosoftNSJS) === "undefined") {
        Object.defineProperty(window, "MicrosoftNSJS", { value: {}, writable: false, enumerable: true, configurable: true });
    }
    if (typeof (MicrosoftNSJS.Advertising) === "undefined") {
        Object.defineProperty(MicrosoftNSJS, "Advertising", { value: {}, writable: false, enumerable: true, configurable: true });
    }

    MicrosoftNSJS.Advertising.Break = function (options) {
        /// <summary locid="MicrosoftNSJS.Advertising.Break">
        ///   This class represents a scheduled break in content playing in MediaPlayer.
        ///   It contains clips which will be played at the break's start time.
        ///   This class is used internally in the ClipScheduler and does not need to be 
        ///   instantiated when scheduling clips.
        /// </summary>
        /// <param name="options" type="object" locid="MicrosoftNSJS.Advertising.Break_p:options">
        ///   The set of properties to be initially set for the Break.
        /// </param>
        /// <returns type="MicrosoftNSJS.Advertising.Break" locid="MicrosoftNSJS.Advertising.Break_returnValue">
        ///   A new Break.
        /// </returns>

        this._startTime = null;
        this._podId = null;
        this._clips = [];
        this._remainingDuration = null;

        MicrosoftNSJS.Advertising.AdUtilities.setOptions(this, options);
    };

    MicrosoftNSJS.Advertising.Break.prototype = {
        /// <field type="number" locid="MicrosoftNSJS.Advertising.Break.startTime">
        ///   The number of seconds into the content timeline when this break should start.
        /// </field>
        get startTime() { return this._startTime; },
        set startTime(value) { this._startTime = value; },

        /// <field type="string" locid="MicrosoftNSJS.Advertising.Break.podId">
        ///   An identifier to distinguish one break from another. Optional.
        ///   This is useful when distinct break start/end events are desired
        ///   for clips starting at the same startTime (e.g. ads from different
        ///   ad providers playing at the same time slot).
        /// </field>
        get podId() { return this._podId; },
        set podId(value) { this._podId = value; },

        /// <field type="number" locid="MicrosoftNSJS.Advertising.Break.remainingDuration">
        ///   This is the total duration (in seconds) of unplayed clips in this Break.
        ///   Clips that have been played (or skipped) are not included in this value.
        ///   Call updateRemainingDuration function to manually trigger a recalculation.
        /// </field>
        get remainingDuration() {
            if (typeof (this._remainingDuration) !== "number") {
                this.updateRemainingDuration();
            }
            return this._remainingDuration;
        },

        addClip: function (clip) {
            /// <summary locid="MicrosoftNSJS.Advertising.Break.addClip">
            ///   Adds the provided clip to this Break.
            /// </summary>
            /// <param name="clip" type="MicrosoftNSJS.Advertising.Clip" locid="MicrosoftNSJS.Advertising.Break.addClip_p:clip">
            ///   The Clip to add to this Break.
            /// </param>
            for (var ix = 0; ix < this._clips.length; ix++) {
                if (this._clips[ix] === clip) {
                    // clip is already present, do not add again
                    return;
                }
            }

            this._clips.push(clip);
            MicrosoftNSJS.Advertising.Break.sortClips(this._clips);
            this._remainingDuration = null;
        },

        removeClip: function (clip) {
            /// <summary locid="MicrosoftNSJS.Advertising.Break.removeClip">
            ///   Removes the provided clip from this Break. No change is made if the clip 
            ///   is not present in the Break.
            /// </summary>
            /// <param name="clip" type="MicrosoftNSJS.Advertising.Clip" locid="MicrosoftNSJS.Advertising.Break.removeClip_p:clip">
            ///   The Clip to remove from this Break.
            /// </param>
            for (var ix = 0; ix < this._clips.length; ix++) {
                if (this._clips[ix] === clip) {
                    this._clips.splice(ix, 1);
                    this._remainingDuration = null;
                    return;
                }
            }
        },

        getNextClip: function () {
            /// <summary locid="MicrosoftNSJS.Advertising.Break.getNextClip">
            ///   Returns the next unplayed clip for playback, sorted according to 'sequence'
            ///   value (if provided on Clip).
            /// </summary>
            /// <returns type="MicrosoftNSJS.Advertising.Clip" locid="MicrosoftNSJS.Advertising.Break.getNextClip_returnValue">
            ///   The next Clip to play.
            /// </returns>
            for (var ix = 0; ix < this._clips.length; ix++) {
                var clip = this._clips[ix];
                if (!clip.isPlayed && !clip.isSkipped) {
                    if (typeof (clip.selectMedia) === "function") {
                        clip.url = clip.selectMedia();
                        if (clip.url === null || typeof (clip.url) !== "string") {
                            clip.isSkipped = true;
                            // force remainingDuration to be recalculated
                            this._remainingDuration = null;
                            continue;
                        }
                    }

                    return clip;
                }
            }
            return null;
        },

        updateRemainingDuration: function () {
            /// <summary locid="MicrosoftNSJS.Advertising.Break.updateRemainingDuration">
            ///   Recalculates the remainingDuration value. This may be necessary when
            ///   a clip is marked as played. This will be called automatically when
            ///   clips are added/removed to the break.
            /// </summary>
            /// <returns type="number" locid="MicrosoftNSJS.Advertising.Break.updateRemainingDuration_returnValue">
            ///   The updated remainingDuration value.
            /// </returns>
            var breakTotalTime = 0;
            for (var ix = 0; ix < this._clips.length; ix++) {
                var clip = this._clips[ix];
                if (!clip.isPlayed && !clip.isSkipped && clip.duration) {
                    breakTotalTime += clip.duration;
                }
            }
            this._remainingDuration = breakTotalTime;
            return this._remainingDuration;
        }

    };

    MicrosoftNSJS.Advertising.Break.sortClips = function (clips) {
        /// <summary locid="MicrosoftNSJS.Advertising.Break.sortClips">
        ///   Sorts the provided array of Clips according to their sequence (if provided).
        /// </summary>
        /// <param name="clips" type="object" locid="MicrosoftNSJS.Advertising.Break.sortClips_p:clips">
        ///   An array of Clips to sort.
        /// </param>
        clips.sort(function (a, b) {
            if (typeof (a.sequence) === "number" && typeof (b.sequence) === "number") {
                return a.sequence - b.sequence;
            } else if (typeof (a.sequence) === "number") {
                return -1;
            } else if (typeof (b.sequence) === "number") {
                return 1;
            }
            return 0;
        });
    };

    MicrosoftNSJS.Advertising.Clip = function (options) {
        /// <summary locid="MicrosoftNSJS.Advertising.Clip">
        ///   A Clip is media to be played at a scheduled time.
        /// </summary>
        /// <param name="options" type="object" locid="MicrosoftNSJS.Advertising.Clip_p:options">
        ///   The set of properties to be initially set for the Clip.
        /// </param>
        /// <returns type="MicrosoftNSJS.Advertising.Clip" locid="MicrosoftNSJS.Advertising.Clip_returnValue">
        ///   A new Clip.
        /// </returns>

        this._timeOffset = null;
        this._type = "video";
        this._url = null;
        this._duration = null;
        this._skipOffset = null;
        this._sequence = null;
        this._selectMedia = null;
        this._podId = null;

        this._isPlayed = false;
        this._isSkipped = false;

        // calculated values
        this._startTime = null;
        this._skipOffsetParsed = null;

        MicrosoftNSJS.Advertising.AdUtilities.setOptions(this, options);
    };

    MicrosoftNSJS.Advertising.Clip.prototype = {
        /// <field type="string" locid="MicrosoftNSJS.Advertising.Clip.timeOffset">
        ///   A string indicating when to play this clip (required)
        ///   (valid formats: number of seconds, "hh:mm:ss.s", "nn%", "start", "end")
        /// </field>
        get timeOffset() { return this._timeOffset; },
        set timeOffset(value) {
            this._timeOffset = value;
            this._startTime = null;
        },

        /// <field type="string" locid="MicrosoftNSJS.Advertising.Clip.type">
        ///   The type of media being played ("video" or "audio").
        /// </field>
        get type() { return this._type; },
        set type(value) { this._type = value; },

        /// <field type="string" locid="MicrosoftNSJS.Advertising.Clip.url">
        ///   The source url of the media (required)
        /// </field>
        get url() { return this._url; },
        set url(value) { this._url = value; },

        /// <field type="function" locid="MicrosoftNSJS.Advertising.Clip.selectMedia">
        ///   A function that will return the source URL of the clip. This can be used in place of
        ///   the url property so that selection of the URL is deferred until the time the clip will
        ///   actually play (e.g. to pick the best available bitrate at that time).
        /// </field>
        get selectMedia() { return this._selectMedia; },
        set selectMedia(value) { this._selectMedia = value; },

        /// <field type="number" locid="MicrosoftNSJS.Advertising.Clip.duration">
        ///   The duration of the clip (optional)
        /// </field>
        get duration() { return this._duration; },
        set duration(value) {
            if (typeof (value) === "number") {
                this._duration = value;
            } else if (typeof (value) === "string") {
                var parsed = parseFloat(value);
                this._duration = (isNaN(parsed) ? null : parsed);
            } else {
                this._duration = null;
            }
            this._skipOffsetParsed = null;
        },

        /// <field type="string" locid="MicrosoftNSJS.Advertising.Clip.skipOffset">
        ///   How long the clip must play before it can be skipped or fast-forwarded
        ///   (optional, specified as number of seconds or "hh:mm:ss.s" or "nn%")
        /// </field>
        get skipOffset() { return this._skipOffset; },
        set skipOffset(value) {
            this._skipOffset = value;
            this._skipOffsetParsed = null;
        },

        /// <field type="number" locid="MicrosoftNSJS.Advertising.Clip.sequence">
        ///   For multiple videos scheduled for the same start time, this number indicates
        ///   the order in which they should be played (optional)
        /// </field>
        get sequence() { return this._sequence; },
        set sequence(value) { this._sequence = value; },

        /// <field type="string" locid="MicrosoftNSJS.Advertising.Clip.podId">
        ///   An identifier to distinguish one break from another. Optional.
        ///   Clips with different podIds will be put into different Breaks, 
        ///   allowing multiple Breaks to be scheduled to start at the same time.
        ///   This is useful when distinct break start/end events are desired
        ///   for clips starting at the same startTime (e.g. ads from different
        ///   ad providers playing at the same time slot).
        /// </field>
        get podId() { return this._podId; },
        set podId(value) { this._podId = value; },

        /// <field type="boolean" locid="MicrosoftNSJS.Advertising.Clip.isPlayed">
        ///   This flag indicates whether the clip has been played. Once a clip
        ///   is marked as skipped, it will never be considered for playback again.
        /// </field>
        get isPlayed() { return this._isPlayed; },
        set isPlayed(value) { this._isPlayed = value; },

        /// <field type="boolean" locid="MicrosoftNSJS.Advertising.Clip.isSkipped">
        ///   This flag indicates whether the clip has been skipped, which can occur
        ///   if no URL can be determined at the scheduled start time. Once a clip
        ///   is marked as skipped, it will never be considered for playback again.
        /// </field>
        get isSkipped() { return this._isSkipped; },
        set isSkipped(value) { this._isSkipped = value; },

        /// <field type="number" locid="MicrosoftNSJS.Advertising.Clip.startTime">
        ///   The time when the clip should start playing, specified in seconds.
        ///   This value is determined from the timeOffset.
        /// </field>
        get startTime() {
            if (typeof (this._startTime) !== "number") {
                this._startTime = MicrosoftNSJS.Advertising.Clip.parseTimeOffset(this._timeOffset, null);
            }
            return this._startTime;
        },

        /// <field type="number" locid="MicrosoftNSJS.Advertising.Clip.skipOffsetParsed">
        ///   This is the skipOffset expressed as seconds, parsed from the skipOffset property.
        /// </field>
        get skipOffsetParsed() {
            if (typeof (this._skipOffsetParsed) !== "number") {
                this._skipOffsetParsed = MicrosoftNSJS.Advertising.Clip.parseSkipOffset(this._skipOffset, this._duration);
            }
            return this._skipOffsetParsed;
        },

        calculateStartTime: function (contentDuration) {
            /// <summary locid="MicrosoftNSJS.Advertising.Clip.calculateStartTime">
            ///   Forces an update of the startTime based on the contentDuration provided.
            ///   This is used when the duration of the content changes so that 
            ///   percentage-based timeOffset values can be recalculated.
            /// </summary>
            /// <param name="contentDuration" type="number" locid="MicrosoftNSJS.Advertising.Clip.calculateStartTime_p:contentDuration">
            ///   The duration of the primary content.
            /// </param>
            this._startTime = MicrosoftNSJS.Advertising.Clip.parseTimeOffset(this._timeOffset, contentDuration);
        },

        validate: function () {
            /// <summary locid="MicrosoftNSJS.Advertising.Clip.validate">
            ///   Validate that the clip and throws error if clip has invalid data.
            /// </summary>
            if (typeof (this._timeOffset) !== "string" && typeof (this._timeOffset) !== "number") {
                var err = new Error(strings.timeOffsetRequired);
                err.name = "MicrosoftNSJS.Advertising.Clip.timeOffsetRequired";
                throw err;
            }

            // Clip must have either a url explicitly set or a selectMedia function.
            if ((typeof (this._url) !== "string" || this._url === "")
                && typeof (this.selectMedia) !== "function") {
                var err = new Error(strings.mediaUrlRequired);
                err.name = "MicrosoftNSJS.Advertising.Clip.mediaUrlRequired";
                throw err;
            }

            if (this._type !== "video" && this._type !== "audio") {
                var err = new Error(strings.mediaTypeInvalid);
                err.name = "MicrosoftNSJS.Advertising.Clip.mediaTypeInvalid";
                throw err;
            }

            // See if we can parse the timeOffset, which should always be possible if a duration is passed.
            var parsed = MicrosoftNSJS.Advertising.Clip.parseTimeOffset(this._timeOffset, 100);
            if (typeof (parsed) !== "number") {
                var err = new Error(strings.timeOffsetInvalid);
                err.name = "MicrosoftNSJS.Advertising.Clip.timeOffsetInvalid";
                throw err;
            }
        }
    };

    MicrosoftNSJS.Advertising.Clip.parseTimeOffset = function (timeOffset, contentDuration) {
        /// <summary locid="MicrosoftNSJS.Advertising.Clip.parseTimeOffset">
        ///   Parses a timeOffset value into the equivalent number of seconds. ContentDuration parameter
        ///   is required when timeOffset is specified as a percentage or "end".
        /// </summary>
        /// <param name="timeOffset" type="string" locid="MicrosoftNSJS.Advertising.Clip.parseTimeOffset_p:timeOffset">
        ///   The timeOffset (e.g. "00:30", "start", "end", "50%").
        /// </param>
        /// <param name="contentDuration" type="number" locid="MicrosoftNSJS.Advertising.Clip.parseTimeOffset_p:contentDuration">
        ///   The duration of the primary content.
        /// </param>
        /// <returns type="number" locid="MicrosoftNSJS.Advertising.Clip.parseTimeOffset_returnValue">
        ///   The number of seconds into the content's timeline when the clip will play, or null if it cannot be determined.
        /// </returns>
        var newStartTime = null;

        /// <disable>JS2045.ReviewEmptyBlocks</disable>
        if (typeof (timeOffset) === "number") {
            newStartTime = timeOffset;
        } else if (typeof (timeOffset) !== "string") {
            newStartTime = null;
        } else if (timeOffset === "start" || timeOffset === "0%") {
            newStartTime = 0;
        } else if (timeOffset === "end" || timeOffset === "100%") {
            if (typeof (contentDuration) === "number" && !isNaN(contentDuration)) {
                newStartTime = contentDuration;
            }
        } else if (timeOffset.indexOf("%") !== -1) {
            if (typeof (contentDuration) === "number" && !isNaN(contentDuration)) {
                var pct = parseFloat(timeOffset.substr(0, timeOffset.indexOf("%"))) / 100;
                newStartTime = pct * contentDuration;
            }
        } else if (timeOffset.indexOf("#") !== -1) {
            // TODO potential support for position in future
        } else {
            // hh:mm:ss.s format
            newStartTime = MicrosoftNSJS.Advertising.AdUtilities.hhmmssToSeconds(timeOffset);
        }
        /// <enable>JS2045.ReviewEmptyBlocks</enable>

        if (typeof (newStartTime) === "number" && !isNaN(newStartTime) && newStartTime >= 0 && newStartTime !== Infinity) {
            return newStartTime;
        } else {
            return null;
        }
    };

    MicrosoftNSJS.Advertising.Clip.parseSkipOffset = function (skipOffset, clipDuration) {
        /// <summary locid="MicrosoftNSJS.Advertising.Clip.parseSkipOffset">
        ///   Parses a skipOffset value into the equivalent number of seconds. ClipDuration parameter
        ///   is required when skipOffset is specified as a percentage of clip duration.
        /// </summary>
        /// <param name="skipOffset" type="string" locid="MicrosoftNSJS.Advertising.Clip.parseSkipOffset_p:skipOffset">
        ///   The timeOffset (e.g. "00:10", "10%").
        /// </param>
        /// <param name="clipDuration" type="number" locid="MicrosoftNSJS.Advertising.Clip.parseSkipOffset_p:clipDuration">
        ///   The duration of the clip.
        /// </param>
        /// <returns type="number" locid="MicrosoftNSJS.Advertising.Clip.parseSkipOffset_returnValue">
        ///   The number of seconds, or Infinity if cannot be determined.
        /// </returns>
        if (typeof (skipOffset) === "number") {
            // Already a number, so no parsing needed.
            return skipOffset;
        }
        if (typeof (skipOffset) !== "string") {
            // if skipOffset is not a string, we can't parse it
            return Infinity;
        }

        var parsed = null;
        if (skipOffset === "0%") {
            parsed = 0;
        } else if (skipOffset.indexOf("%") !== -1) {
            // percentage format
            if (typeof (clipDuration) === "number" && !isNaN(clipDuration) && clipDuration !== Infinity) {
                var pct = parseFloat(skipOffset.substr(0, skipOffset.indexOf("%"))) / 100;
                parsed = pct * clipDuration;
            }
        } else {
            // hh:mm:ss.s format
            parsed = MicrosoftNSJS.Advertising.AdUtilities.hhmmssToSeconds(skipOffset);
        }

        // convert a string in format "hh:mm:ss.s" to the number of seconds
        if (typeof (parsed) === "number" && !isNaN(parsed)) {
            return parsed;
        } else {
            return Infinity;
        }
    };

    var strings = {
        get timeOffsetRequired() { return "clip must include timeOffset"; },
        get timeOffsetInvalid() { return "timeOffset is invalid"; },
        get mediaUrlRequired() { return "clip must contain 'url' value or 'selectMedia' function"; },
        get mediaTypeInvalid() { return "clip media type is invalid"; },
    };

}());

/*!
  Copyright (C) Microsoft. All rights reserved.
  This library is supported for use in Windows Store apps only.
*/
(function () {
    "use strict";

    if (typeof (MicrosoftNSJS) === "undefined") {
        Object.defineProperty(window, "MicrosoftNSJS", { value: {}, writable: false, enumerable: true, configurable: true });
    }
    if (typeof (MicrosoftNSJS.Advertising) === "undefined") {
        Object.defineProperty(MicrosoftNSJS, "Advertising", { value: {}, writable: false, enumerable: true, configurable: true });
    }

    /// <summary>The BannerContainer is to render ads in banner view.</summary>
    MicrosoftNSJS.Advertising.BannerContainer = function (options) {
        // call the base constructor
        MicrosoftNSJS.Advertising.AdContainer.call(this, options);
        this._name = "BannerContainer";
        this._sizeBeforeExpand = null;
    };

    // Copy the base class prototype and set the constructor.
    MicrosoftNSJS.Advertising.BannerContainer.prototype = Object.create(MicrosoftNSJS.Advertising.AdContainer.prototype);
    Object.defineProperty(MicrosoftNSJS.Advertising.BannerContainer.prototype, "constructor", 
        { value: MicrosoftNSJS.Advertising.BannerContainer, writable: true, configurable: true, enumerable: true });

    var extendedPrototype = {
        // Fades in the view container (webView).
        // @params
        //  fadeOptions - options to use for fading
        //      .fadeInTimeS - fade in duration
        //      .timer - timers
        //          .linear - linear type timer
        //      .fadeOutTimeS - fade out duration
        fadeIn: function (fadeOptions, callback) {
            if (this._state !== MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DEFAULT) {
                this._log("Unable to fade in container in current state. State: ." + this._state, { fnName: "fadeIn" });
                return;
            }

            try {
                if (this._viewContainer_DOM) {
                    this._viewContainer_DOM.style.visibility = "inherit";
                    this._viewContainer_DOM.style.transition = "opacity " + fadeOptions.fadeInTimeS + "s" + fadeOptions.timer.linear;
                    this._viewContainer_DOM.style.opacity = 1;
                    if (typeof (callback) === "function") {
                        window.setTimeout(function () { callback(true); }, fadeOptions.fadeInTimeS * 1000);
                    }
                } else if (typeof (callback) === "function") {
                    callback(false);
                }
            }
            catch (err) {
                this._log("Unable to fade in. Error:{0}", { fnName: "fadeIn", err: err });
            }
        },

        scaleAd: function (width, height) {
            if (this.size.width > 0 && this.size.height > 0) {
                var xScale = width / this.size.width;
                var yScale = height / this.size.height;

                if (this._viewContainer_DOM) {
                    this._viewContainer_DOM.style.transformOrigin = "left top";
                    // _currentScale need to be restored after closing the expanded view.
                    this._currentScale = "scale(" + xScale + "," + yScale + ")";
                    this._viewContainer_DOM.style.transform = this._currentScale;
                }
            }
        },

        // Expands the current ad container to the specified size.
        // @params
        //  [url]:string - optional url to load in the expanded container for 2 part creative
        expand: function (url) {
            if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DISPOSED) {
                return;
            }

            if (this.mraidState === MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.HIDDEN) {
                this._log("Unable to expand, in hidden state.", { fnName: "expand" });
                return;
            }

            if (this.mraidState === MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.EXPANDED) {
                this._log("Unable to expand, already in expanded state.", { fnName: "expand" });
                return;
            }

            if (typeof (window._msAdEngaged) !== "undefined" && window._msAdEngaged && !this._isUserEngaged) {
                this._log("Unable to expand, another ad is engaged.", { fnName: "expand" });
                return;
            }

            if (url && url.length > 0) {
                // handle 2 part creatives.

                // Check to make sure the url is allowed to actually be navigated to.
                if (!MicrosoftNSJS.Advertising.AdUtilities.isValidLaunchUri(url)) {
                    this._log("Unable to expand, url of incorrect scheme or too long.", { fnName: "expand" });
                    return;
                }

                var uri = new Windows.Foundation.Uri(url);

                MicrosoftNSJS.Advertising.AdUtilities.readNetworkContentsAsync(uri).then(
                    function (contents) {
                        if (contents) {

                            MicrosoftNSJS.Advertising.AdUtilities.loadResourceFile(MicrosoftNSJS.Advertising.AdContainer.ORMMA_RESOURCE_INDEX).then(function (ormmaResult) {

                                MicrosoftNSJS.Advertising.AdUtilities.loadResourceFile(MicrosoftNSJS.Advertising.AdContainer.BOOTSTRAPJS_RESOURCE_INDEX).then(function (bootstrapResult) {
                                    if (this.state === MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DISPOSED) {
                                        return;
                                    }

                                    var javaScriptContent = "<script type=\"text/javascript\">" + ormmaResult + "</script><script type=\"text/javascript\">" + bootstrapResult + "</script>";

                                    // This tag is needed due to some payloads using relative links to js files and etc.
                                    // The WebView control when navigated using navigateToString (as is in this case) will
                                    // set the source to 'about:blank'. This breaks when the url supplied payload has relative
                                    // links. For ex: script src='/b/g/x.js' will result in 'about:/b/g/x.js' which will 
                                    // cause the script to not load. The BASE HTML tag prevents this by opening all relative
                                    // links using the supplied base value.
                                    var baseElementHTML = MicrosoftNSJS.Advertising.AdContainer.BASE_ELEMENT_TEMPLATE
                                        .replace("{url}", uri.schemeName + "://" + uri.host);

                                    this._expandMraid({
                                        sourceHTML: javaScriptContent + baseElementHTML + contents,
                                        onAdContainerLoaded: function (args) {
                                            // Update all the expanded ad properties so that calls to those properties in the new container will return valid values.
                                            this.screenSize = this.maxSize = { forceUpdate: true, width: document.documentElement.offsetWidth, height: document.documentElement.offsetHeight };
                                            this.size = {
                                                forceUpdate: true,
                                                width: this.expandProperties.width,
                                                height: this.expandProperties.height
                                            };

                                            this.state = MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.EXPANDED;
                                            this.mraidState = MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.EXPANDED;
                                            this._initializeOrmma();
                                            this._setupCloseEvents();
                                            this.isEngaged = true;
                                        }.bind(this)
                                    });
                                }.bind(this),
                                function (bootstrapJsError) {
                                    this._log("Unable to load ad into container. Error:{0}", { fnName: "expand", err: bootstrapJsError });
                                }.bind(this));
                            }.bind(this),
                            function (ormmaJsError) {
                                this._log("Unable to load ad into container. Error:{0}", { fnName: "expand", err: ormmaJsError });
                            }.bind(this));
                        }
                    }.bind(this),
                    function (error) {
                        this._log("Unable to retrieve url contents. Error: {0}", { fnName: "expand", err: error });
                    }.bind(this));
            }
            else {
                this._expandMraid({
                    onAdContainerLoaded: function (args) {
                        this.mraidState = MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.EXPANDED;
                        this.state = MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.EXPANDED;
                        this.size = {
                            width: this.expandProperties.width,
                            height: this.expandProperties.height
                        };
                        this._setupCloseEvents();
                        this.isEngaged = true;
                    }.bind(this)
                });
            }

        },

        // Private Methods

        // Expands as an mraid container
        // @params
        //  options:{[sourceHTML],[onAdContainerLoaded]}
        //   .sourceHTML:string - contents that if supplied will bo loaded into a new webview element
        //   .onAdContainerLoaded:function - callback function once ad container contents have been loaded
        _expandMraid: function (options) {
            try {
                this._overlayDiv_DOM = this._createOverlayDiv();

                this._sizeBeforeExpand = this.size;

                if (options.sourceHTML && options.sourceHTML.length > 0) {
                    this._expandedContainer_DOM = this._createExpandedContainer();

                    this._expandedContainer_DOM.addEventListener("MSWebViewNavigationCompleted", function (args) {
                        if (typeof (options.onAdContainerLoaded) === "function") {
                            options.onAdContainerLoaded();
                        }
                    }.bind(this));

                    // 2 part creative will have EXPANDING state, which will the new WebView to load the expanding ads.
                    // Expanded state will be set when MSWebViewNavigationCompleted is fired.
                    this.state = MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.EXPANDING;
                    this._expandedContainer_DOM.navigateToString(options.sourceHTML);
                    this._overlayDiv_DOM.appendChild(this._expandedContainer_DOM);
                }
                else {
                    // reuse the anchor webView for expansion.
                    this._expandedContainer_DOM = this._createExpandedContainer(this._viewContainer_DOM);
                    this._parentElement_DOM.removeChild(this._viewContainer_DOM);
                    this._overlayDiv_DOM.appendChild(this._expandedContainer_DOM);

                    if (typeof (options.onAdContainerLoaded) === "function") {
                        options.onAdContainerLoaded();
                    }
                }

                document.body.appendChild(this._overlayDiv_DOM);
            }
            catch (error) {
                this._log("Unable to expand. Error thrown [{0}]", { fnName: "_expandMraid", err: error });
            }
        },

        // Expanded container for dual container expansion. Call this inside a try/catch block only.
        _createExpandedContainer: function (expandedContainer) {
            if (!expandedContainer) {
                expandedContainer = document.createElement("x-ms-webview");
                expandedContainer.id = this._id + "_expandedContainer";
                expandedContainer.title = MicrosoftNSJS.Advertising.AdContainer.STRINGS.WEBVIEW_TITLE;
            }

            expandedContainer.style.width = "100%";
            expandedContainer.style.height = "100%";
            expandedContainer.marginwidth = 0;
            expandedContainer.marginheight = 0;
            expandedContainer.frameBorder = 0;
            expandedContainer.style.transform = "";
            expandedContainer.style.transformOrigin = "";

            return expandedContainer;
        },

        _initializeOrmma: function () {
            this.size = this.maxSize = { width: this.parentElement.offsetWidth, height: this.parentElement.offsetHeight, forceUpdate: true };

            MicrosoftNSJS.Advertising.AdContainer.prototype._initializeOrmma.call(this);
        },

        _closeExpandView: function () {
            this._overlayDiv_DOM.removeChild(this._expandedContainer_DOM);
            this._expandedContainer_DOM = null;
            if (!this._viewContainer_DOM.parentNode) {
                this._parentElement_DOM.appendChild(this._viewContainer_DOM);
            }

            if (this._overlayDiv_DOM) {
                document.body.removeChild(this._overlayDiv_DOM);
                this._overlayDiv_DOM = null;
            }

            if (this._overlayClose) {
                this._overlayClose.dispose();
                this._overlayClose = null;
            }

            this.mraidState = MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.DEFAULT;
            this.state = MicrosoftNSJS.Advertising.AdContainer.STATE_TYPE.DEFAULT;
            this.isEngaged = false;
            // set size back to anchor, because size is updated when expanding.
            this.size = this.maxSize = this._sizeBeforeExpand;
            this._sizeBeforeExpand = null;
            if (this._currentScale) {
                this._viewContainer_DOM.style.transformOrigin = "left top";
                this._viewContainer_DOM.style.transform = this._currentScale;
            }
            this._cleanupCloseEvents();
        },

        _setupCloseEvents: function () {
            // If ESC key is pressed we will treat as a close signal.
            this._keyUpHandler = function (e) {
                /*escape key is code 27*/
                if (e.keyCode === 27) {
                    this.close();
                }
            }.bind(this);
            document.addEventListener("keyup", this._keyUpHandler);

            // Phone back button will close the ad.
            this._backButtonHandler = function (evt) {
                this.close();
                evt.handled = true;
                return true;
            }.bind(this);
            this._addBackClickListener(this._backButtonHandler);
        },

        _cleanupCloseEvents: function () {
            if (this._backButtonHandler) {
                this._removeBackClickListener(this._backButtonHandler);
                this._backButtonHandler = null;
            }

            if (this._keyUpHandler) {
                document.removeEventListener("keyup", this._keyUpHandler);
                this._keyUpHandler = null;
            }
        },

        _addBackClickListener: function (listener) {
            // If WinJS exists, add listener to WinJS.Application so that the ad will receive back-click event
            // before other WinJS logic (e.g. for page navigation). If we use SystemNavigationManager directly,
            // WinJS will process the event first and app may navigate back rather than just closing expanded ad.
            if (typeof (WinJS) !== "undefined" && typeof (WinJS.Application) !== "undefined") {
                WinJS.Application.addEventListener("backclick", listener);
            } else {
                var navManager = Windows.UI.Core.SystemNavigationManager && Windows.UI.Core.SystemNavigationManager.getForCurrentView();
                if (navManager) {
                    // On Win10 this accomodates hardware buttons (phone), the taskbar's tablet mode button, and the optional window frame back button.
                    navManager.addEventListener("backrequested", listener);
                }
            }
        },

        _removeBackClickListener: function (listener) {
            if (typeof (WinJS) !== "undefined" && typeof (WinJS.Application) !== "undefined") {
                WinJS.Application.removeEventListener("backclick", listener);
            } else {
                var navManager = Windows.UI.Core.SystemNavigationManager && Windows.UI.Core.SystemNavigationManager.getForCurrentView();
                if (navManager) {
                    navManager.removeEventListener("backrequested", listener);
                }
            }
        }
    };

    function mergeExtended(target, members) {
        var keys = Object.getOwnPropertyNames(members);
        var i, len;
        for (var ix = 0; ix < keys.length; ix++) {
            var key = keys[ix];
            var memberProperty = Object.getOwnPropertyDescriptor(members, key);
            Object.defineProperty(target, key, memberProperty);
        }
    }

    mergeExtended(MicrosoftNSJS.Advertising.BannerContainer.prototype, extendedPrototype);

})();
/// <loc filename="metadata\ad.xml" format="messagebundle" />
/*!
  Copyright (C) Microsoft. All rights reserved.
  This library is supported for use in Windows Store apps only.
*/
(function () {
    "use strict";

    if (typeof (MicrosoftNSJS) === "undefined") {
        Object.defineProperty(window, "MicrosoftNSJS", { value: {}, writable: false, enumerable: true, configurable: true });
    }
    if (typeof (MicrosoftNSJS.Advertising) === "undefined") {
        Object.defineProperty(MicrosoftNSJS, "Advertising", { value: {}, writable: false, enumerable: true, configurable: true });
    }
    
    /// <summary locid="MicrosoftNSJS.Advertising">Used by InterstitialAd.js as well as ad.js for housing common functions used in display ads</summary>

    MicrosoftNSJS.Advertising.DisplayAdController = function () {
        this._onErrorFired = null;
        try {
            this._adTags = new Microsoft.Advertising.Shared.WinRT.AdTagCollection();

            // context object to add telemetry logging
            this._context = new Microsoft.Advertising.Shared.WinRT.ProjectedContext();
        }
        catch (err) {
            // If our library is not available, allow to continue. An errorOccurred event will fire on first refresh.
        }
        this.applicationId = null;
        this.adUnitId = null;
        this.serviceUrl = null;
        this.countryOrRegion = null;
        this.postalCode = null;
        this.keywords = null;

        this._adWidth = null;
        this._adHeight = null;

        this._isDisposed = false;
        this._placement = null;
    };

    MicrosoftNSJS.Advertising.DisplayAdController.prototype = {
        _SDK_TYPE: Microsoft.Advertising.Shared.WinRT.SdkType.universalDisplayWwa,

        _DEFAULT_AD_REQUEST_TIMEOUT_IN_MILLISECONDS: 30000, // 30 seconds

        _MIN_AD_REFRESH_INTERVAL_MS: 30000, // 30 seconds

        get placement() { return this._placement; },

        get adTagsJson() {
            if (this._adTags !== null && typeof (this._adTags) !== "undefined") {
                try {
                    return this._adTags.getAdTagsJson();
                }
                catch (e) {
                    this._log("error: could not get renderer options as json");
                    return null;
                }
            }
            return null;
        },

        get adTag () { return this._adTags; },

        get adWidth () { return this._adWidth; },
        set adWidth(value) { this._adWidth = value; },

        get adHeight() { return this._adHeight; },
        set adHeight (value) { this._adHeight = value; },

        ///   Event to bubble up the OnErrorOccurred event to the AdControl            
        get onErrorFired () { return this._onErrorFired; },
        set onErrorFired (value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onErrorFired = value;
            }
        },

        addAdTag: function (tagName, tagValue) {
            if (typeof (tagName) === "string" && typeof (tagValue) === "string") {
                try {
                    this._adTags.addAdTag(tagName, tagValue);
                } catch (e) {
                    this.fireErrorOccurred("could not add ad tag", MicrosoftNSJS.Advertising.AdErrorCode.clientConfiguration);
                }
            }
            else {
                this.fireErrorOccurred("could not add ad tag as they were not strings", MicrosoftNSJS.Advertising.AdErrorCode.clientConfiguration);
            }
        },

        removeAdTag: function (tagName) {
            if (typeof (tagName) === "string") {
                try {
                    this._adTags.removeAdTag(tagName);
                } catch (e) {
                    this.fireErrorOccurred("could not remove ad tag", MicrosoftNSJS.Advertising.AdErrorCode.clientConfiguration);
                }
            } // else do nothing if it's not a string it was never added in the first place
        },

        requestAd: function () {
            return new Promise(function (complete, error, progress) {
                try {
                    var placementSetResult = this._createPlacement();
                    if (!placementSetResult) {
                        error(null);
                        return;
                    }

                    if (this._context !== null && typeof (this._context) !== "undefined") {
                        this._context.getLogger().setPublisherId(this.applicationId);
                        this._context.getLogger().setAdUnitId(this.adUnitId);
                        this._context.getLogger().setSdkType(Microsoft.Advertising.Shared.WinRT.SdkType.universalDisplayWwa);
                    }

                    this._log("DisplayAdController:_requestAd:Request Ad", "_requestAd");
                    this.placement.getAdAsync(this._DEFAULT_AD_REQUEST_TIMEOUT_IN_MILLISECONDS, this._context).then(
                        function getAdSuccessHandler(ad) {
                            if (ad !== null) {
                                // new ad received
                                this._log("DisplayAdController:_requestAd:Receive Ad", "_requestAd");
                                if (typeof (complete) === "function") {
                                    complete(ad);
                                }
                            } else {
                                // ad is null for some reason so treat as error                                   
                                if (!this._isDisposed && this._placement !== null && typeof (this._placement) !== "undefined") {
                                    error(this._placement.lastError);
                                }
                            }
                        }.bind(this),
                        function getAdErrorHandler(evt) {
                            // error occurred on request
                            if (!this._isDisposed && this._placement !== null && typeof (this._placement) !== "undefined") {
                                error(this._placement.lastError);
                            }
                        }.bind(this)
                    );
                }
                catch (err) {
                    error({ errorMessage: err.message, errorCode: MicrosoftNSJS.Advertising.AdErrorCode.other });
                }
            }.bind(this));
        },

        dispose: function () {
            this._onErrorFired = null;
            this._disposeAdPlacement();
            this._isDisposed = true;
        },

        fireErrorOccurred: function (msg, errorCode, errorCodeEnum) {
            this._log(msg + " (" + errorCode + ")", { fnName: "fireErrorOccurred" });

            // Convert AdErrorCode to native enum if errorCodeEnum is not provided.
            if (errorCodeEnum === undefined) {
                errorCodeEnum = MicrosoftNSJS.Advertising.AdErrorCode.convertToEnum(errorCode);
            }

            if (this._context !== null && typeof (this._context) !== "undefined") {
                this._context.getLogger().setSdkType(Microsoft.Advertising.Shared.WinRT.SdkType.universalDisplayWwa);
                this._context.getLogger().logError(errorCodeEnum, msg);
            }

            // only fire non-mraidOperationFailure error to developers.
            if (typeof (this._onErrorFired) === "function" && errorCode !== MicrosoftNSJS.Advertising.AdErrorCode.mraidOperationFailure) {
                this._onErrorFired({ errorMessage: msg, errorCode: errorCode });
            }
        },

        errorOccurredCallback: function (evt) {
            if (this._isDisposed) {
                return;
            }
            if (typeof (evt) !== "object" || evt === null) {
                this.fireErrorOccurred("Other", MicrosoftNSJS.Advertising.AdErrorCode.other);
            } else {
                this.fireErrorOccurred(evt.errorMessage, evt.errorCode, evt.errorCodeEnum);
            }

        },

        _createPlacement: function () {
            if (this._placement === null) {
                try {
                    this._placement = new Microsoft.Advertising.Shared.WinRT.AdPlacement(this._SDK_TYPE);
                }
                catch (err) {
                    this.fireErrorOccurred("could not initialize AdPlacement", MicrosoftNSJS.Advertising.AdErrorCode.other);
                    return false;
                }
            }

            if (this.adWidth === null) {
                this.fireErrorOccurred("Ad Width must be set", MicrosoftNSJS.Advertising.AdErrorCode.clientConfiguration);
                return false;
            }
            this._placement.width = this.adWidth;

            if (this.adHeight === null) {
                this.fireErrorOccurred("Ad Height must be set", MicrosoftNSJS.Advertising.AdErrorCode.clientConfiguration);
                return false;
            }
            this._placement.height = this.adHeight;

            this._placement.applicationId = this.applicationId;
            this._placement.adUnitId = this.adUnitId;
            this._placement.serviceUrl = this.serviceUrl;
            this._placement.keywords = this.keywords;

            this._placement.clearLastError();
            this._placement.countryOrRegion = this.countryOrRegion;
            if (this._placement.lastError !== null) {
                this._log("DisplayAdController:_createPlacement:Placement setting error:" + this._placement.lastError.errorMessage, "_createPlacement");
                this.errorOccurredCallback(this._placement.lastError);
            }

            this._placement.clearLastError();
            this._placement.postalCode = this.postalCode;
            if (this._placement.lastError !== null) {
                this._log("DisplayAdController:_createPlacement:Placement setting error:" + this._placement.lastError.errorMessage, "_createPlacement");
                this.errorOccurredCallback(this._placement.lastError);
            }

            if (this._adTags !== null && typeof (this._adTags) !== "undefined") {
                this._placement.adTags = this._adTags;
            }
            return true;
        },

        _log: function (msg, args) {
            
        },

        _disposeAdPlacement: function () {
            if (this._placement !== null) {
                this._placement.onadrefreshed = null;
                this._placement.onerroroccurred = null;
                this._placement = null;
            }
        }
    };

})();
/// <loc filename="metadata\InterstitialAd.xml" format="messagebundle" />
/*!
  Copyright (C) Microsoft. All rights reserved.
  This library is supported for use in Windows Store apps only.
*/
(function () {
    "use strict";

    if (typeof (MicrosoftNSJS) === "undefined") {
        Object.defineProperty(window, "MicrosoftNSJS", { value: {}, writable: false, enumerable: true, configurable: true });
    }
    if (typeof (MicrosoftNSJS.Advertising) === "undefined") {
        Object.defineProperty(MicrosoftNSJS, "Advertising", { value: {}, writable: false, enumerable: true, configurable: true });
    }

    MicrosoftNSJS.Advertising.InterstitialAdType = {
        video: "video",
        display: "display"
    };

    MicrosoftNSJS.Advertising.InterstitialAdState = {
        notReady: "notReady",
        ready: "ready",
        showing: "showing",
        closed: "closed"
    };

    /// <summary locid="MicrosoftNSJS.Advertising">Microsoft Advertising SDK allows developers to add ads to their apps.</summary>
    /// <event name="onAdReady" locid="MicrosoftNSJS.Advertising.InterstitialAd.onAdReady">Raised when the ad is received from server and ready to be shown</event>
    /// <event name="onCompleted" locid="MicrosoftNSJS.Advertising.InterstitialAd.onCompleted">Raised when a shown ad has been closed after ad experience is complete</event>
    /// <event name="onCancelled" locid="MicrosoftNSJS.Advertising.InterstitialAd.onCancelled">Raised when the user cancels the ad experience before it is complete. This applies only to video ads.</event>
    /// <event name="onErrorOccurred" locid="MicrosoftNSJS.Advertising.InterstitialAd.onErrorOccurred">Raised when error during ad request or display</event>
    MicrosoftNSJS.Advertising.InterstitialAd = function(options) {
        /// <summary locid="MicrosoftNSJS.Advertising.InterstitialAd">
        ///   InterstitialAd allows developers to add full-screen interstitial ads to their apps.
        /// </summary>
        /// <param name="options" type="object" locid="MicrosoftNSJS.Advertising.InterstitialAd_p:options">
        ///   The set of options to be applied initially to the InterstitialAd.
        /// </param>
        /// <returns type="MicrosoftNSJS.Advertising.InterstitialAd" locid="MicrosoftNSJS.Advertising.InterstitialAd_returnValue">An InterstitialAd instance.</returns>

        this._log("InterstitialAd:Constructor:s", { fnName: "Constructor" });

        try {
            try {
                this._adTags = new Microsoft.Advertising.Shared.WinRT.AdTagCollection();

                // context object to add telemetry logging
                this._context = new Microsoft.Advertising.Shared.WinRT.ProjectedContext();                        
            }
            catch (err) {
                // If our core library is not available, allow to continue. An error event will fire on ad request.
            }

            // internal properties
            this._ad = null; // the current ad being handled (may be instance of a video or display ad)
            this._isDisposed = false;
            this._hasShownAd = false;

            // properties with public accessors
            this._requestTimeout = this._DEFAULT_AD_REQUEST_TIMEOUT_MS;                    
            this._countryOrRegion = null;
            this._keywords = null;
            this._postalCode = null;

            // event handlers
            this._onAdReady = null;
            this._onCompleted = null;
            this._onCancelled = null;
            this._onErrorOccurred = null;

            MicrosoftNSJS.Advertising.AdUtilities.setOptions(this, options);

            this._log("InterstitialAd:Constructor:e", { fnName: "Constructor" });
        }
        catch (err) {
            return;
        }
    };

    MicrosoftNSJS.Advertising.InterstitialAd.prototype = {
        _DEFAULT_AD_REQUEST_TIMEOUT_MS: 30000,

        /// <field type="Function" locid="MicrosoftNSJS.Advertising.InterstitialAd.onAdReady">
        ///   This event fires when an interstitial ad is ready to be shown. 
        ///   The handler function takes a single parameter which is the InterstitialAd which fired the event.
        /// </field>
        get onAdReady() { return this._onAdReady; },
        set onAdReady(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onAdReady = value;
            }
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising.InterstitialAd.onCompleted">
        ///   This event fires after the ad has been closed and the ad experience is considered complete.
        ///   The handler function takes a single parameter which is the InterstitialAd which fired the event.
        /// </field>
        get onCompleted() { return this._onCompleted; },
        set onCompleted(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onCompleted = value;
            }
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising.InterstitialAd.onCancelled">
        ///   This event fires if the user cancels the ad before it is considered complete. 
        ///   This can only be triggered for video ads.
        ///   The handler function takes a single parameter which is the InterstitialAd which fired the event.
        /// </field>
        get onCancelled() { return this._onCancelled; },
        set onCancelled(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onCancelled = value;
            }
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising.InterstitialAd.onErrorOccurred">
        ///   This event fires when the InterstitialAd experiences an error.
        ///   The handler function takes two parameters: the InterstitialAd which fired the event, and 
        ///   an object containing the errorMessage and errorCode.
        /// </field>
        get onErrorOccurred() { return this._onErrorOccurred; },
        set onErrorOccurred(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onErrorOccurred = value;
            }
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising.InterstitialAd.countryOrRegion">
        ///   Country or region where the user is located.
        /// </field>
        get countryOrRegion() { return this._countryOrRegion; },
        set countryOrRegion(value) {
            this._countryOrRegion = value;
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising.InterstitialAd.keywords">
        ///   Keywords to assist in ad targeting.
        /// </field>
        get keywords() { return this._keywords; },
        set keywords(value) {
            this._keywords = value;
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising.InterstitialAd.postalCode">
        ///   Postal code of the user.
        /// </field>
        get postalCode() { return this._postalCode; },
        set postalCode(value) {
            this._postalCode = value;
        },

        /// <field type="Number" locid="MicrosoftNSJS.Advertising.InterstitialAd.requestTimeout">
        ///   The number of milliseconds to wait for an ad request to complete before timing out.
        ///   The default is 30000ms or 30 seconds.
        /// </field>
        get requestTimeout() { return this._requestTimeout; },
        set requestTimeout(value) {
            if (typeof (value) === "number" && !isNaN(value) && value > 0) {
                this._requestTimeout = value;
            } else {
                this._requestTimeout = this._DEFAULT_AD_REQUEST_TIMEOUT_MS;
            }
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising.InterstitialAd.state">
        ///   The current state of the interstitial ad.
        ///   See <c>MicrosoftNSJS.Advertising.InterstitialAdState</c> enumeration.
        /// </field>
        get state() {
            if (!this._ad) {
                if (this._hasShownAd) {
                    return MicrosoftNSJS.Advertising.InterstitialAdState.closed;
                } else {
                    return MicrosoftNSJS.Advertising.InterstitialAdState.notReady;
                }
            } else {
                return this._ad.state;
            }
        },

        addAdTag: function (tagName, tagValue) {
            /// <summary locid="MicrosoftNSJS.Advertising.InterstitialAd.addAdTag">
            ///   Add an ad tag to the interstitial ad. The maximum is 10 tags. If maximum is exceeded an error event will be fired. 
            /// </summary>
            /// <param name="tagName" locid="MicrosoftNSJS.Advertising.InterstitialAd.addAdTag_p:tagName">The name of the tag. Maximum of 16 characters, if exceeded an errorOccurred event will be fired.</param>
            /// <param name="tagValue" locid="MicrosoftNSJS.Advertising.InterstitialAd.addAdTag_p:tagValue">The value of the tag. Maximum of 128 characters, if exceeded an errorOccurred event will be fired.</param>
            if (typeof (tagName) === "string" && typeof (tagValue) === "string") {
                try {
                    this._adTags.addAdTag(tagName, tagValue);
                } catch (e) {
                    this._fireErrorOccurredEvent("could not add ad tag", MicrosoftNSJS.Advertising.AdErrorCode.clientConfiguration);
                }
            }
            else {
                this._fireErrorOccurredEvent("could not add ad tag as they were not strings", MicrosoftNSJS.Advertising.AdErrorCode.clientConfiguration);
            }
        },

        removeAdTag: function (tagName) {
            /// <summary locid="MicrosoftNSJS.Advertising.InterstitialAd.removeAdTag">
            ///   Remove an ad tag from the ad control. This has no effect if the tag name does not exist.
            /// </summary>
            /// <param name="tagName" locid="MicrosoftNSJS.Advertising.InterstitialAd.removeAdTag_p:tagName">The name of the tag to remove.</param>
            if (typeof (tagName) === "string") {
                try {
                    this._adTags.removeAdTag(tagName);
                } catch (e) {
                    this._fireErrorOccurredEvent("could not remove ad tag", MicrosoftNSJS.Advertising.AdErrorCode.clientConfiguration);
                }
            } // else do nothing if it's not a string it was never added in the first place
        },

        requestAd: function (adType, applicationId, adUnitId) {
            /// <summary locid="MicrosoftNSJS.Advertising.InterstitialAd.requestAd">
            ///   A call to this method directs the <c>InterstitialAd</c> to request an ad from the server.
            ///   When an ad has been retrieved successfully, the onAdReady event will fire. 
            ///   If there is a problem retrieving an ad, the onError event will fire instead.
            ///   The ad will not be shown to the user until the <c>show</c> function is called.
            /// </summary>
            /// <param name="type" type="String" locid="MicrosoftNSJS.Advertising.InterstitialAd.requestAd_p:adType">
            ///   The ad type to request. See <c>InterstitialAdType</c> enumeration.
            /// </param>
            /// <param name="type" type="String" locid="MicrosoftNSJS.Advertising.InterstitialAd.requestAd_p:applicationId">
            ///   The application ID of the app. This value is provided to you when you register the app with PubCenter.
            /// </param>
            /// <param name="type" type="String" locid="MicrosoftNSJS.Advertising.InterstitialAd.requestAd_p:adUnitId">
            ///   The adUnitId as provisioned on PubCenter.
            /// </param>

            // Check if we are in a state that allows new ad requests.
            if (this._isDisposed || !this._canStartRequest()) {
                return;
            }

            if (this._context !== null && typeof (this._context) !== "undefined") {
                this._context.getLogger().setPublisherId(applicationId);
                this._context.getLogger().setAdUnitId(adUnitId);
                //reset logger params if a previous service url request was made 
                //service url should be used for test purposes only.
                this._context.getLogger().setSourceUrl(null);
            }

            if (adType === MicrosoftNSJS.Advertising.InterstitialAdType.video) {
                if (this._context !== null && typeof (this._context) !== "undefined") {
                    this._context.getLogger().setSdkType(Microsoft.Advertising.Shared.WinRT.SdkType.universalVideoWwa);
                }
            }
            else if (adType === MicrosoftNSJS.Advertising.InterstitialAdType.display) {
                this._context.getLogger().setSdkType(Microsoft.Advertising.Shared.WinRT.SdkType.interstitialDisplayWwa);
            }

            if (!adUnitId || (typeof (adUnitId) !== "string" && typeof (adUnitId) !== "number")) {
                this._fireErrorOccurredEvent("requestAd requires valid adUnitId", MicrosoftNSJS.Advertising.AdErrorCode.clientConfiguration);
                return;
            }

            if (!applicationId) {
                applicationId = "";
            }

            this._ad = this._createInterstitialAdInstance(adType);
            
            if (this._ad) {
                this._ad.requestAd(applicationId, adUnitId);
            }
        },

        show: function () {
            /// <summary locid="MicrosoftNSJS.Advertising.InterstitialAd.show">
            ///   If an ad is ready, this call will make it visible to the user.
            /// </summary>

            if (this._ad && this._ad.state === MicrosoftNSJS.Advertising.InterstitialAdState.ready) {
                this._ad.show();
            } else if (this._ad && this._ad.state === MicrosoftNSJS.Advertising.InterstitialAdState.showing) {
                //ad is already showing. no-op
            } else {
                this._fireErrorOccurredEvent("show called before ad is ready", MicrosoftNSJS.Advertising.AdErrorCode.clientConfiguration);
            }
        },

        close: function () {
            /// <summary locid="MicrosoftNSJS.Advertising.InterstitialAd.close">
            ///   Hide (if showing) and discard any currently loaded ad.
            ///   Once closed, the same ad may not be shown again.
            ///   App may request a new ad after prior ad is closed.
            /// </summary>

            if (this._ad) {
                this._ad.close();

                // ads cannot be shown a second time, so dispose of it
                this._disposeAdInstance();
            }
        },

        dispose: function () {
            /// <summary locid="MicrosoftNSJS.Advertising.InterstitialAd.dispose">
            ///   A call to this method directs the <c>InterstitialAd</c> to release resources and unregister listeners.
            /// </summary>
            /// <remarks>
            ///   The <c>InterstitialAd</c> will not function after this is called. 
            /// </remarks>
            try {
                this._log("InterstitialAd.dispose:s", "dispose");

                this._isDisposed = true;

                this._disposeAdInstance();

                this._requestTimeout = null;
                this._countryOrRegion = null;
                this._keywords = null;
                this._postalCode = null;

                this._onAdReady = null;
                this._onCompleted = null;
                this._onCancelled = null;
                this._onErrorOccurred = null;

                this._log("InterstitialAd.dispose:e", "dispose");
            }
            catch (err) {
            }
        },

        _canStartRequest: function () {
            // Only allow new requests if the current ad is in the notReady or closed state.
            return (this.state === MicrosoftNSJS.Advertising.InterstitialAdState.notReady ||
                    this.state === MicrosoftNSJS.Advertising.InterstitialAdState.closed);
        },

        _createInterstitialAdInstance: function (adType) {
            var newAd;

            if (adType === MicrosoftNSJS.Advertising.InterstitialAdType.video) {
                newAd = new MicrosoftNSJS.Advertising._InterstitialVideoAd();
            }
            else if (adType === MicrosoftNSJS.Advertising.InterstitialAdType.display) {
                newAd = new MicrosoftNSJS.Advertising._InterstitialDisplayAd();

                // set properties specific to display ads
                newAd.countryOrRegion = this._countryOrRegion;
                newAd.keywords = this._keywords;
                newAd.postalCode = this._postalCode;
            } 
            else {                        
                this._fireErrorOccurredEvent("ad type is invalid", MicrosoftNSJS.Advertising.AdErrorCode.clientConfiguration);
                return null;
            }

            // set properties common to both ad types
            newAd.adTags = this._adTags;
            newAd.requestTimeout = this._requestTimeout;
            newAd._context = this._context;

            // bubble up event from the ad implementation to app
            newAd.onAdReady = this._fireAdReadyEvent.bind(this);
            newAd.onCompleted = this._fireCompletedEvent.bind(this);
            newAd.onCancelled = this._fireCancelledEvent.bind(this);
            newAd.onErrorOccurred = function (sender, args) {
                this._fireErrorOccurredEvent(args.errorMessage, args.errorCode);
            }.bind(this);

            return newAd;
        },

        _disposeAdInstance: function () {
            if (this._ad) {
                this._hasShownAd = true;
                this._ad.dispose();
                this._ad = null;
            }
        },

        _fireAdReadyEvent: function () {
            if (typeof (this._onAdReady) === "function") {
                this._onAdReady(this);
            }
        },

        _fireCompletedEvent: function () {
            this._disposeAdInstance();

            if (typeof (this._onCompleted) === "function") {
                this._onCompleted(this);
            }
        },

        _fireCancelledEvent: function () {
            this._disposeAdInstance();

            if (typeof (this._onCancelled) === "function") {
                this._onCancelled(this);
            }
        },

        _fireErrorOccurredEvent: function (msg, errorCode) {

            // Convert errorCode to native enum.
            var errorCodeEnum = MicrosoftNSJS.Advertising.AdErrorCode.convertToEnum(errorCode);                    

            if (this._context !== null && typeof (this._context) !== "undefined") {
                this._context.getLogger().logError(errorCodeEnum, msg);
            }

            this._disposeAdInstance();

            this._log(msg + " (" + errorCode + ")", { fnName: "_fireErrorOccurredEvent" });
            if (typeof (this._onErrorOccurred) === "function") {
                this._onErrorOccurred(this, { errorMessage: msg, errorCode: errorCode });
            }
        },

        _log: function (msg, args) {
            
        }
    };

    MicrosoftNSJS.Advertising.InterstitialAd.OBJECT_NAME = "MicrosoftNSJS.Advertising.InterstitialAd";

})();

/// <loc filename="metadata\_InterstitialAdBase.xml" format="messagebundle" />
/*!
  Copyright (C) Microsoft. All rights reserved.
  This library is supported for use in Windows Store apps only.
*/
(function () {
    "use strict";

    if (typeof (MicrosoftNSJS) === "undefined") {
        Object.defineProperty(window, "MicrosoftNSJS", { value: {}, writable: false, enumerable: true, configurable: true });
    }
    if (typeof (MicrosoftNSJS.Advertising) === "undefined") {
        Object.defineProperty(MicrosoftNSJS, "Advertising", { value: {}, writable: false, enumerable: true, configurable: true });
    }

    /// <summary locid="MicrosoftNSJS.Advertising">Microsoft Advertising SDK allows developers to add ads to their apps.</summary>
    /// <name locid="MicrosoftNSJS.Advertising._InterstitialAdBase">_InterstitialAdBase</name>
    /// <event name="onAdReady" locid="MicrosoftNSJS.Advertising._InterstitialAdBase.onAdReady">Raised when the ad is received from server and ready to be shown</event>
    /// <event name="onComplete" locid="MicrosoftNSJS.Advertising._InterstitialAdBase.onComplete">Raised when a shown ad has been closed after ad experience is complete</event>
    /// <event name="onCancel" locid="MicrosoftNSJS.Advertising._InterstitialAdBase.onCancel">Raised when the user cancels the ad experience before it is complete. This applies only to video ads.</event>
    /// <event name="onError" locid="MicrosoftNSJS.Advertising._InterstitialAdBase.onError">Raised when error during ad request or display</event>
    MicrosoftNSJS.Advertising._InterstitialAdBase = function (options) { };

    MicrosoftNSJS.Advertising._InterstitialAdBase.prototype = {
        /// <field type="Function" locid="MicrosoftNSJS.Advertising._InterstitialAdBase.onAdReady">
        ///   This event is fired when the InterstitialAd receives an ad from the server and is ready to show.
        ///   The handler function takes a single parameter which is the object which fired the event.
        /// </field>
        get onAdReady() { return this._onAdReady; },
        set onAdReady(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onAdReady = value;
            }
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising._InterstitialAdBase.onCompleted">
        ///   This event is fired after the ad has been closed and the ad experience is considered complete.
        ///   The handler function takes a single parameter which is the object which fired the event.
        /// </field>
        get onCompleted() { return this._onCompleted; },
        set onCompleted(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onCompleted = value;
            }
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising._InterstitialAdBase.onCancelled">
        ///   This event is fired if the user cancels the ad before it is considered complete. 
        ///   This can only be triggered for video ads.
        ///   The handler function takes a single parameter which is the object which fired the event.
        /// </field>
        get onCancelled() { return this._onCancelled; },
        set onCancelled(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onCancelled = value;
            }
        },

        /// <field type="Function" locid="MicrosoftNSJS.Advertising._InterstitialAdBase.onErrorOccurred">
        ///   This event is fired when the InterstitialAd experiences an error.
        ///   The handler function takes two parameters: the object which fired the event, and 
        ///   an object containing the errorMessage and errorCode.
        /// </field>
        get onErrorOccurred() { return this._onErrorOccurred; },
        set onErrorOccurred(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._onErrorOccurred = value;
            }
        },

        /// <field type="Number" locid="MicrosoftNSJS.Advertising.InterstitialAd.requestTimeout">
        ///   The number of milliseconds to wait for an ad request response before timing 
        ///   out. The default is 30000ms or 30 seconds.
        /// </field>
        get requestTimeout() { return this._requestTimeout; },
        set requestTimeout(value) {
            if (typeof (value) === "number" && !isNaN(value)) {
                this._requestTimeout = value >= 0 ? value : 0;
            }
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising._InterstitialAdBase.state">
        ///   The current state of the interstitial ad.
        ///   See <c>MicrosoftNSJS.Advertising.InterstitialAdState</c> enumeration.
        /// </field>
        get state() {
            return MicrosoftNSJS.Advertising.InterstitialAdState.notReady;
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising._InterstitialAdBase.adTags">
        ///   A collection of ad tags to be included in ad requests.
        ///   See class <c>Microsoft.Advertising.Shared.WinRT.AdTagCollection</c>.
        /// </field>
        get adTags() { return this._adTags; },
        set adTags(value) {
            this._adTags = value;
        },

        requestAd: function (applicationId, adUnitId) {
            /// <summary locid="MicrosoftNSJS.Advertising._InterstitialAdBase.requestAd">
            /// <para>
            ///   A call to this method directs the <c>InterstitialAd</c> to request an ad from the server.
            ///   When an ad has been retrieved successfully, the onAdReady event will fire. 
            ///   If there is a problem retrieving an ad, the onError event will fire instead.
            ///   The ad will not be shown to the user until the <c>show</c> function is called.
            /// </para>
            /// </summary>
            /// <param name="type" type="String" locid="MicrosoftNSJS.Advertising._InterstitialAdBase.requestAd_p:applicationId">
            ///   The application ID of the app. This value is provided to you when you register the app with PubCenter.
            /// </param>
            /// <param name="type" type="String" locid="MicrosoftNSJS.Advertising._InterstitialAdBase.requestAd_p:adUnitId">
            ///   The adUnitId as provisioned on PubCenter.
            /// </param>

            // IMPLEMENT IN DERIVING CLASS
        },

        show: function () {
            /// <summary locid="MicrosoftNSJS.Advertising._InterstitialAdBase.show">
            /// <para>
            ///   If an ad is ready, this call will make it visible to the user.
            /// </para>
            /// </summary>

            // IMPLEMENT IN DERIVING CLASS
        },

        close: function () {
            /// <summary locid="MicrosoftNSJS.Advertising._InterstitialAdBase.close">
            /// <para>
            ///   If the ad is currently showing, this function will cause it to be removed and discarded.
            ///   Once closed, an ad may not be shown again.
            /// </para>
            /// </summary>

            // IMPLEMENT IN DERIVING CLASS
        },

        dispose: function () {
            /// <summary locid="MicrosoftNSJS.Advertising._InterstitialAdBase.dispose">
            /// <para>
            ///   A call to this method directs the <c>InterstitialAd</c> to release resources and unregister listeners.
            /// </para>
            /// </summary>
            /// <remarks>
            ///   The <c>_InterstitialAdBase</c> will not function after this is called. 
            /// </remarks>

            // IMPLEMENT IN DERIVING CLASS
        },

        _fireAdReadyEvent: function () {
            if (typeof (this._onAdReady) === "function") {
                this._onAdReady(this);
            }
        },

        _fireCompletedEvent: function () {
            if (typeof (this._onCompleted) === "function") {
                this._onCompleted(this);
            }
        },

        _fireCancelledEvent: function () {
            if (typeof (this._onCancelled) === "function") {
                this._onCancelled(this);
            }
        },

        _fireErrorOccurredEvent: function (msg, errorCode) {
            this._log(msg + " (" + errorCode + ")", { fnName: "_fireErrorOccurredEvent" });
            if (typeof (this._onErrorOccurred) === "function") {
                this._onErrorOccurred(this, { errorMessage: msg, errorCode: errorCode });
            }
        },

        _getBounds: function () {
            // Calculate the size of the expanded ad considering the size of the available screen.
            var screenHeight = document.documentElement.offsetHeight;
            var screenWidth = document.documentElement.offsetWidth;

            return { x: 0, y: 0, width: screenWidth, height: screenHeight };
        },

        _setupEventHandlers: function () {
            this._documentResizeHandlerBound = this._documentResizeHandler.bind(this);
            window.addEventListener("resize", this._documentResizeHandlerBound);

            // If ESC key is pressed we will treat as a close signal.
            this._keyUpHandler = function (e) {
                /*escape key is code 27*/
                if (e.keyCode === 27) {
                    this.close();
                }
            }.bind(this);
            document.addEventListener("keyup", this._keyUpHandler);

            // Phone back button will close the ad.
            this._backButtonHandler = function (e) {
                if (this._state === MicrosoftNSJS.Advertising.InterstitialAdState.showing) {
                    this.close();
                    return true;
                } else {
                    return false;
                }
            }.bind(this);
            this._addBackClickListener(this._backButtonHandler);
        },

        _clearEventHandlers: function () {
            if (typeof (this._documentResizeHandlerBound) === "function") {
                window.removeEventListener("resize", this._documentResizeHandlerBound);
                this._documentResizeHandlerBound = null;
            }

            if (this._backButtonHandler) {
                this._removeBackClickListener(this._backButtonHandler);
                this._backButtonHandler = null;
            }

            if (this._keyUpHandler) {
                document.removeEventListener("keyup", this._keyUpHandler);
                this._keyUpHandler = null;
            }
        },

        // Indicate that this ad is engaged using the same mechanism as AdControl (global flag, and using global event manager).
        _setEngaged: function (isEngaged) {
            if (!this._globalEventManager) {
                this._globalEventManager = new MicrosoftNSJS.Advertising.AdGlobalEventManager();
            }

            if (isEngaged) {
                window._msAdEngaged = true;
                try {
                    this._globalEventManager.broadcastEvent(MicrosoftNSJS.Advertising.AdGlobalEventManager.EVENT_TYPE.AD_ENGAGED, "interstitial ad");
                }
                catch (error) {
                    this._log("unable to broadcast global engaged event. Error: {0}", { "err": error, fnName: "_setEngaged" });
                }
            } else {
                window._msAdEngaged = false;
                try {
                    this._globalEventManager.broadcastEvent(MicrosoftNSJS.Advertising.AdGlobalEventManager.EVENT_TYPE.AD_DISENGAGED, "interstitial ad");
                }
                catch (err) {
                    this._log("unable to broadcast global engaged event. Error: {0}", { "err": err, fnName: "_setEngaged" });
                }
            }
        },

        _isAnotherAdEngaged: function () {
            return typeof (window._msAdEngaged) !== "undefined" && window._msAdEngaged;
        },

        _addBackClickListener: function (listener) {
            // If WinJS exists, add listener to WinJS.Application so that the ad will receive back-click event
            // before other WinJS logic (e.g. for page navigation). If we use SystemNavigationManager directly,
            // WinJS will process the event first and app may navigate back rather than just closing expanded ad.
            if (typeof (WinJS) !== "undefined" && typeof (WinJS.Application) !== "undefined") {
                WinJS.Application.addEventListener("backclick", listener);
            } else {
                var navManager = Windows.UI.Core.SystemNavigationManager && Windows.UI.Core.SystemNavigationManager.getForCurrentView();
                if (navManager) {
                    // On Win10 this accomodates hardware buttons (phone), the taskbar's tablet mode button, and the optional window frame back button.
                    navManager.addEventListener("backrequested", listener);
                }
            }
        },

        _removeBackClickListener: function (listener) {
            if (typeof (WinJS) !== "undefined" && typeof (WinJS.Application) !== "undefined") {
                WinJS.Application.removeEventListener("backclick", listener);
            } else {
                var navManager = Windows.UI.Core.SystemNavigationManager && Windows.UI.Core.SystemNavigationManager.getForCurrentView();
                if (navManager) {
                    navManager.removeEventListener("backrequested", listener);
                }
            }
        },

        _log: function (msg, args) {
            
        }
    };

    MicrosoftNSJS.Advertising._InterstitialAdBase.DEFAULT_AD_REQUEST_TIMEOUT_MS = 30000;

})();

/*!
  Copyright (C) Microsoft. All rights reserved.
  This library is supported for use in Windows Store apps only.
*/
(function () {
    "use strict";

    if (typeof (MicrosoftNSJS) === "undefined") {
        Object.defineProperty(window, "MicrosoftNSJS", { value: {}, writable: false, enumerable: true, configurable: true });
    }
    if (typeof (MicrosoftNSJS.Advertising) === "undefined") {
        Object.defineProperty(MicrosoftNSJS, "Advertising", { value: {}, writable: false, enumerable: true, configurable: true });
    }

    /// <summary>The InterstitialContainer is to render interstital ads in full screen view.</summary>
    MicrosoftNSJS.Advertising.InterstitialContainer = function (options) {
        // call the base constructor
        MicrosoftNSJS.Advertising.AdContainer.call(this, options);
        this._name = "InterstitialContainer";
        this._adClosed = null;
    };

    // Copy the base class prototype and set the constructor.
    MicrosoftNSJS.Advertising.InterstitialContainer.prototype = Object.create(MicrosoftNSJS.Advertising.AdContainer.prototype);
    Object.defineProperty(MicrosoftNSJS.Advertising.InterstitialContainer.prototype, "constructor",
        { value: MicrosoftNSJS.Advertising.InterstitialContainer, writable: true, configurable: true, enumerable: true });

    var extendedPrototype = {
        // Event to let AdControl know that ad was closed.
        get onAdClosed() { return this._adClosed; },
        set onAdClosed(value) {
            if (typeof (value) === "function" || value === null || typeof (value) === "undefined") {
                this._adClosed = value;
            }
        },

        // Creates a new ad container and wires up messaging.
        // @params
        //  options:{sourceHTML}
        create: function (options) {
            this._overlayDiv_DOM = this._createOverlayDiv();
            this._overlayDiv_DOM.id = this._generateUniqueId();
            options.parentElement = this._overlayDiv_DOM;

            MicrosoftNSJS.Advertising.AdContainer.prototype.create.call(this, options);
            this._overlayDiv_DOM.style.width = "100%";
            this._overlayDiv_DOM.style.height = "100%";
            this._viewContainer_DOM.style.width = "100%";
            this._viewContainer_DOM.style.height = "100%";
        },

        // Shows the interstitial ad
        show: function () {
            // Checks the full screen ad has been created or not.
            // TODO: we also need to check whether mraidState !== loading.
            if (this._overlayDiv_DOM) {
                document.body.appendChild(this._overlayDiv_DOM);
                MicrosoftNSJS.Advertising.AdContainer.prototype.show.call(this);
            }
            else {
                this._log("Unable to show view container. Error:{0}", { fnName: "show", err: "overlay div is not created." });
            }
        },

        // Hides the interstitial ad
        close: function () {
            if (this._overlayDiv_DOM && this._overlayDiv_DOM.parentElement == document.body) {
                document.body.removeChild(this._overlayDiv_DOM);
            }
            if (this.mraidState === MicrosoftNSJS.Advertising.AdContainer.MRAID_STATE_TYPE.DEFAULT) {
                MicrosoftNSJS.Advertising.AdContainer.prototype.close.call(this);
                if (typeof (this._adClosed) === "function") {
                    // Fire Ad Closed event upto the AdControl
                    this._adClosed();
                }
            }
        },

        expand: function (url) {
            this._log("Unable to expand. Error:{0}", { fnName: "expand", err: "InterstitialContainer doesn't allow to expand." });
        },

        // Gracefully disposes of the current instance.
        dispose: function () {
            if (this._overlayDiv_DOM && this._overlayDiv_DOM.parentElement == document.body) {
                document.body.removeChild(this._overlayDiv_DOM);
            }
            this._adClosed = null;
            MicrosoftNSJS.Advertising.AdContainer.prototype.dispose.call(this);
        },

        _generateUniqueId: function () {
            // Generates an id which is not already in use in the document.
            var generatedId = null;
            var existingElem = null;
            do {
                generatedId = "ad" + Math.floor(Math.random() * 10000);
                existingElem = document.getElementById(generatedId);
            }
            while (existingElem !== null);

            return generatedId;
        },

        _initializeOrmma: function () {
            // Set placementType = interstitial
            this.postMessage({ msg: MicrosoftNSJS.Advertising.AdContainer.MSG_TYPE_SETPLACEMENTTYPE + ":" + MicrosoftNSJS.Advertising.InterstitialContainer.PLACEMENTTYPE });

            this.size = this.maxSize = { width: document.documentElement.offsetWidth, height: document.documentElement.offsetHeight };

            MicrosoftNSJS.Advertising.AdContainer.prototype._initializeOrmma.call(this);
        }
    };

    MicrosoftNSJS.Advertising.InterstitialContainer.PLACEMENTTYPE = "interstitial";

    function mergeExtended(target, members) {
        var keys = Object.getOwnPropertyNames(members);
        var i, len;
        for (var ix = 0; ix < keys.length; ix++) {
            var key = keys[ix];
            var memberProperty = Object.getOwnPropertyDescriptor(members, key);
            Object.defineProperty(target, key, memberProperty);
        }
    }

    mergeExtended(MicrosoftNSJS.Advertising.InterstitialContainer.prototype, extendedPrototype);

})();

/// <loc filename="metadata\InterstitialDisplayAd.xml" format="messagebundle" />
/*!
  Copyright (C) Microsoft. All rights reserved.
  This library is supported for use in Windows Store apps only.
*/
(function () {
    "use strict";

    if (typeof (MicrosoftNSJS) === "undefined") {
        Object.defineProperty(window, "MicrosoftNSJS", { value: {}, writable: false, enumerable: true, configurable: true });
    }
    if (typeof (MicrosoftNSJS.Advertising) === "undefined") {
        Object.defineProperty(MicrosoftNSJS, "Advertising", { value: {}, writable: false, enumerable: true, configurable: true });
    }

        /// <summary locid="MicrosoftNSJS.Advertising">Microsoft Advertising SDK allows developers to add ads to their apps.</summary>
        /// <name locid="MicrosoftNSJS.Advertising.InterstitialDisplayAd">InterstitialDisplayAd</name>
        /// <event name="onAdReady" locid="MicrosoftNSJS.Advertising.InterstitialDisplayAd.onAdReady">Raised when the ad is received from server and ready to be shown</event>
        /// <event name="onComplete" locid="MicrosoftNSJS.Advertising.InterstitialDisplayAd.onComplete">Raised when a shown ad has been closed after ad experience is complete</event>
        /// <event name="onCancel" locid="MicrosoftNSJS.Advertising.InterstitialDisplayAd.onCancel">Raised when the user cancels the ad experience before it is complete. This applies only to video ads.</event>
        /// <event name="onError" locid="MicrosoftNSJS.Advertising.InterstitialDisplayAd.onError">Raised when error during ad request or display</event>
    MicrosoftNSJS.Advertising._InterstitialDisplayAd = function (options) {
        /// <summary locid="MicrosoftNSJS.Advertising.InterstitialDisplayAd">
        ///   InterstitialDisplayAd handles handles the presentation of full-screen display interstitial ads.
        /// </summary>
        /// <param name="options" type="object" locid="MicrosoftNSJS.Advertising.InterstitialDisplayAd_p:options">
        ///   The set of options to be applied initially to the InterstitialDisplayAd.
        /// </param>
        /// <returns type="MicrosoftNSJS.Advertising.InterstitialDisplayAd" locid="MicrosoftNSJS.Advertising.InterstitialDisplayAd_returnValue">An InterstitialDisplayAd instance.</returns>

        this._log("InterstitialDisplayAd:Constructor:s", { fnName: "Constructor" });

        // call the base constructor
        MicrosoftNSJS.Advertising._InterstitialAdBase.call(this, options);

        try {
            this._adTags = null;
            this._requestInProgress = false;
            this._requestTimeout = this._DEFAULT_AD_REQUEST_TIMEOUT_MS;
            this._isDisposed = false;
            this._state = MicrosoftNSJS.Advertising.InterstitialAdState.notReady;
            // event handlers
            this._onAdReady = null;
            this._onCompleted = null;
            this._onCancelled = null;
            this._onErrorOccurred = null;

            this._documentResizeHandlerBound = null;
            this._keyUpHandler = null;
            this._backButtonHandler = null;

            this._adContainer = null;
            this._adController = new MicrosoftNSJS.Advertising.DisplayAdController();
            this._adController.onErrorFired = function (errorArgs) {
                this._fireErrorOccurredEvent(errorArgs.errorMessage, errorArgs.errorCode);
            }.bind(this);

            MicrosoftNSJS.Advertising.AdUtilities.setOptions(this, options);

            this._log("InterstitialDisplayAd:Constructor:e", { fnName: "Constructor" });
        }
        catch (err) {
            return;
        }
    };

    // Copy the base class prototype and set the constructor.
    MicrosoftNSJS.Advertising._InterstitialDisplayAd.prototype = Object.create(MicrosoftNSJS.Advertising._InterstitialAdBase.prototype);
    Object.defineProperty(MicrosoftNSJS.Advertising._InterstitialDisplayAd.prototype, "constructor",
        { value: MicrosoftNSJS.Advertising._InterstitialDisplayAd, writable: true, configurable: true, enumerable: true });

    var extendedPrototype = {
        _DEFAULT_AD_REQUEST_TIMEOUT_MS: 30000,               

        /// <field type="String" locid="MicrosoftNSJS.Advertising._InterstitialDisplayAd.state">
        ///   The current state of the interstitial ad.
        ///   See <c>MicrosoftNSJS.Advertising.InterstitialAdState</c> enumeration.
        /// </field>
        get state() {
            return this._state;
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising.InterstitialAd.applicationId">
        ///   The application ID of the app. This value is provided to you when you register the app with PubCenter.
        /// </field>
        get applicationId () { return this._adController.applicationId; },
        set applicationId (value) {
            if (this._adController.applicationId !== value) {
                this._adController.applicationId = value;
            }
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising.InterstitialAd.adUnitId">
        ///   The adUnitId as provisioned on PubCenter. This id specifies the width, height, and format of ad.
        /// </field>
        get adUnitId() { return this._adController.adUnitId; },
        set adUnitId(value) {
            if (this._adController.adUnitId !== value) {
                this._adController.adUnitId = value;
            }
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising.InterstitialAd.serviceUrl">
        ///   The service URL.
        /// </field>
        get serviceUrl() { return this._adController.serviceUrl; },
        set serviceUrl (value) {
            if (this._adController.serviceUrl !== value) {
                this._adController.serviceUrl = value;
            }
        },
        /// <field type="String" locid="MicrosoftNSJS.Advertising.InterstitialAd.countryOrRegion">
        ///   Country or region where the user is located.
        /// </field>
        get countryOrRegion () { return this._adController.countryOrRegion; },
        set countryOrRegion (value) {
            if (this._adController.countryOrRegion !== value)
                this._adController.countryOrRegion = value;
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising.InterstitialAd.keywords">
        ///   Keywords to assist in ad targeting.
        /// </field>
        get keywords () { return this._adController.keywords; },
        set keywords (value) {
            if (this._adController.keywords !== value)
                this._adController.keywords = value;
        },

        /// <field type="String" locid="MicrosoftNSJS.Advertising.InterstitialAd.postalCode">
        ///   Postal code of the user.
        /// </field>
        get postalCode () { return this._adController.postalCode; },
        set postalCode (value) {
            if (this._adController.postalCode !== value)
                this._adController.postalCode = value;
        },

        requestAd: function (applicationId, adUnitId) {
            /// <summary locid="MicrosoftNSJS.Advertising.InterstitialDisplayAd.requestAd">
            /// <para>
            ///   A call to this method directs the <c>InterstitialDisplayAd</c> to request an ad from the server.
            ///   When an ad has been retrieved successfully, the onAdReady event will fire. 
            ///   If there is a problem retrieving an ad, the onError event will fire instead.
            ///   The ad will not be shown to the user until the <c>show</c> function is called.
            /// </para>
            /// </summary>
            /// <param name="type" type="String" locid="MicrosoftNSJS.Advertising.InterstitialDisplayAd.requestAd_p:applicationId">
            ///   The application ID of the app. This value is provided to you when you register the app with PubCenter.
            /// </param>
            /// <param name="type" type="String" locid="MicrosoftNSJS.Advertising.InterstitialDisplayAd.requestAd_p:adUnitId">
            ///   The adUnitId as provisioned on PubCenter.
            /// </param>

            if (this._isDisposed || this._requestInProgress || this._state !== MicrosoftNSJS.Advertising.InterstitialAdState.notReady) {
                return;
            }
            this.applicationId = applicationId;
            this.adUnitId = adUnitId;
            this._adController.adTags = this._adTags;

            this._sendRequest({});
        },

        show: function () {
            /// <summary locid="MicrosoftNSJS.Advertising.InterstitialDisplayAd.show">
            /// <para>
            ///   If an ad is ready, this call will make it visible to the user.
            /// </para>
            /// </summary>
            if (this._state !== MicrosoftNSJS.Advertising.InterstitialAdState.ready)
                return;
            this._setupEventHandlers();
            this._state = MicrosoftNSJS.Advertising.InterstitialAdState.showing;
            this._adContainer.show();
        },

        close: function () {
            /// <summary locid="MicrosoftNSJS.Advertising.InterstitialDisplayAd.close">
            /// <para>
            ///   If the ad is currently showing, this function will cause it to be removed and discarded.
            ///   Once closed, an ad may not be shown again.
            /// </para>
            /// </summary>
            if (this._state !== MicrosoftNSJS.Advertising.InterstitialAdState.showing)
                return;

            this._adContainer.close();
            this._state = MicrosoftNSJS.Advertising.InterstitialAdState.closed;
            this._clearEventHandlers();
            this._fireCompletedEvent();                                        
        },

        dispose: function () {
            /// <summary locid="MicrosoftNSJS.Advertising.InterstitialDisplayAd.dispose">
            /// <para>
            ///   A call to this method directs the <c>InterstitialDisplayAd</c> to release resources and unregister listeners.
            /// </para>
            /// </summary>
            /// <remarks>
            ///   The <c>InterstitialDisplayAd</c> will not function after this is called. 
            /// </remarks>
            try {
                this._log("InterstitialDisplayAd.dispose:s", "dispose");
                this._isDisposed = true;                        
                this._requestInProgress = false;
                this._adTags = null;

                // remove event handlers 
                this._onAdReady = null;
                this._onCompleted = null;                        
                this._onErrorOccurred = null;
                this._clearEventHandlers();

                if (this._adContainer) {
                    this._adContainer.dispose();
                    this._adContainer = null;
                }
                if (this._adController) {
                    this._adController.dispose();
                    this._adController = null;
                }
                this._log("InterstitialDisplayAd.dispose:e", "dispose");
            }
            catch (err) {
            }
        },

        _sendRequest: function (params) {
            if (this._requestInProgress) {
                this._adController.fireErrorOccurred("refresh triggered but request is already in progress", MicrosoftNSJS.Advertising.AdErrorCode.refreshNotAllowed);
                return;
            }
            this._requestInProgress = true;
            //set width and height for placement
            this._setupAdController();

            this._adController.requestAd().then(

                function successHandler(ad) {
                    this._createInterstitialContainer(ad);
                }.bind(this),
                function errorHandler(error) {
                    this._requestInProgress = false;
                    if (error !== null) {
                        this._log("DisplayAdController:_requestAd:Receive error:" + error.errorMessage, "_requestAd");
                        this._errorOccurredCallback(error);
                    }
                }.bind(this)
            );
        },

        // Called when an Ad is received
        // Creates Ad Container and fires ready event
        _createInterstitialContainer: function (ad) {
            if (this._isDisposed)
                return;

            if (ad !== null) {
                this._adContainer = new MicrosoftNSJS.Advertising.InterstitialContainer(MicrosoftNSJS.Advertising.AdContainer.TYPE.UNIVERSAL);                        
                this._adContainer.onError = function (error) {
                    // If the ad reports an error, it means it could not initialize or render, so remove the frame.
                    if (this._adContainer) {
                        this._adContainer.dispose();
                        this._adContainer = null;
                        this._fireErrorOccurredEvent(error, MicrosoftNSJS.Advertising.AdErrorCode.other);
                    }
                }.bind(this);
                this._adContainer.onAdContainerLoaded = function () {
                    // we have received the ad and we are ready to show it on calling show method
                    this._state = MicrosoftNSJS.Advertising.InterstitialAdState.ready;
                    this._fireAdReadyEvent();
                }.bind(this);
                this._adContainer.onAdClosed = function () {
                    // Ad is closed, we need to fire close on AdControl
                    this._state = MicrosoftNSJS.Advertising.InterstitialAdState.closed;                            
                    this._clearEventHandlers();
                    this._fireCompletedEvent();
                }.bind(this);

                this._adContainer.load({ "ad": ad, "adTags": this._adController.adTagsJson });
            }
            this._requestInProgress = false;
        },

        _documentResizeHandler: function () {
            if (!this._isDisposed) {
                // Updates the Interstitial popup so that it fills the entire screen.
                var bounds = this._getBounds();                        
                // Tell container that the available screen size has changed, so the ad knows how much space is available.
                if (this._adContainer) {
                    this._adContainer.screenSize = {
                        height: bounds.height,
                        width: bounds.height
                    };
                    this._adContainer.size = {
                        height: bounds.height,
                        width : bounds.height
                    };
                }
            }
        },

        _setupAdController: function () {
            var bounds = this._getBounds();
            this._adController.adWidth = bounds.width;
            this._adController.adHeight = bounds.height;
            this._adController._SDK_TYPE = Microsoft.Advertising.Shared.WinRT.SdkType.interstitialDisplayWwa;
        },

        // This is the callback for when the AdPlacement class fires an error event. We
        // re-fire the event.
        _errorOccurredCallback: function (evt) {
            if (this._isDisposed)
                return;

            this._adController.errorOccurredCallback(evt);
            this._requestInProgress = false;
        },
    };

    // Merge the above new prototype members into the class prototype.
    function mergeExtended(target, members) {
        var keys = Object.getOwnPropertyNames(members);
        var i, len;
        for (var ix = 0; ix < keys.length; ix++) {
            var key = keys[ix];
            var memberProperty = Object.getOwnPropertyDescriptor(members, key);
            Object.defineProperty(target, key, memberProperty);
        }
    }

    mergeExtended(MicrosoftNSJS.Advertising._InterstitialDisplayAd.prototype, extendedPrototype);

})();

/// <loc filename="metadata\InterstitialVideoAd.xml" format="messagebundle" />
/*!
  Copyright (C) Microsoft. All rights reserved.
  This library is supported for use in Windows Store apps only.
*/
(function () {
    "use strict";

    if (typeof (MicrosoftNSJS) === "undefined") {
        Object.defineProperty(window, "MicrosoftNSJS", { value: {}, writable: false, enumerable: true, configurable: true });
    }
    if (typeof (MicrosoftNSJS.Advertising) === "undefined") {
        Object.defineProperty(MicrosoftNSJS, "Advertising", { value: {}, writable: false, enumerable: true, configurable: true });
    }

    MicrosoftNSJS.Advertising.MediaProgress = {
        start: "start",
        firstQuartile: "firstQuartile",
        midpoint: "midpoint",
        thirdQuartile: "thirdQuartile",
        complete: "complete"
    };

    /// <summary locid="MicrosoftNSJS.Advertising">Microsoft Advertising SDK allows developers to add ads to their apps.</summary>
    /// <name locid="MicrosoftNSJS.Advertising.InterstitialVideoAd">InterstitialVideoAd</name>
    /// <event name="onAdReady" locid="MicrosoftNSJS.Advertising.InterstitialVideoAd.onAdReady">Raised when the ad is received from server and ready to be shown</event>
    /// <event name="onComplete" locid="MicrosoftNSJS.Advertising.InterstitialVideoAd.onComplete">Raised when a shown ad has been closed after ad experience is complete</event>
    /// <event name="onCancel" locid="MicrosoftNSJS.Advertising.InterstitialVideoAd.onCancel">Raised when the user cancels the ad experience before it is complete. This applies only to video ads.</event>
    /// <event name="onError" locid="MicrosoftNSJS.Advertising.InterstitialVideoAd.onError">Raised when error during ad request or display</event>
    MicrosoftNSJS.Advertising._InterstitialVideoAd = function (options) {
        /// <summary locid="MicrosoftNSJS.Advertising.InterstitialVideoAd">
        ///   InterstitialVideoAd allows developers to add full-screen interstitial ads to their apps.
        /// </summary>
        /// <param name="options" type="object" locid="MicrosoftNSJS.Advertising.InterstitialVideoAd_p:options">
        ///   The set of options to be applied initially to the InterstitialVideoAd.
        /// </param>
        /// <returns type="MicrosoftNSJS.Advertising.InterstitialVideoAd" locid="MicrosoftNSJS.Advertising.InterstitialVideoAd_returnValue">An InterstitialVideoAd instance.</returns>

        this._log("InterstitialVideoAd:Constructor:s", { fnName: "Constructor" });

        // call the base constructor
        MicrosoftNSJS.Advertising._InterstitialAdBase.call(this, options);

        try {
            this._requestInProgress = false;
            this._isDisposed = false;
            this._isShowing = false;
            this._isError = false;
            this._maxMeteredBitrate = 2000; //kbps
            this._videoElement = null;
            this._closeButton = null;
            this._countdownElement = null;
            this._clickThroughElement = null;
            this._adNoticeElement = null;
            this._lastClipTime = 0;
            this._reportedEvents = {};
            this._break = null;
            this._currentClip = null;
            this._adRequestStartTime = 0;
            this._mediaTimeoutTimerId = null;
            this._state = MicrosoftNSJS.Advertising.InterstitialAdState.notReady;
            this._context = null;
            this._previousProgress = 0;
            this._secondsSinceLastProgress = 0;
            this._progressTimeoutTimerId = null;

            // The max z-index value is 2147483647 (if you set it higher, it will be lowered to this value anyway).
            // For the interstitial ad, put it at z-index of (max - 10), so that it will be very high, but app can still
            // put a dialog on top of it if needed.
            this._videoZIndex = 2147483647 - 10;

            // our internal event handlers, which we keep handle on for cleanup
            this._clipEventSubscriptions = [];

            this._documentResizeHandlerBound = null;
            this._windowFocusHandlerBound = null;
            this._windowBlurHandlerBound = null;
            this._keyUpHandler = null;
            this._backButtonHandler = null;

            // properties with public accessors
            this._adTags = null;
            this._requestTimeout = MicrosoftNSJS.Advertising._InterstitialVideoAd._defaultAdRequestTimeoutMs;                    

            // event handlers
            this._onAdReady = null;
            this._onCompleted = null;
            this._onCancelled = null;
            this._onErrorOccurred = null;                    

            MicrosoftNSJS.Advertising.AdUtilities.setOptions(this, options);

            this._log("InterstitialVideoAd:Constructor:e", { fnName: "Constructor" });
        }
        catch (err) {
            return;
        }
    };

    // Copy the base class prototype and set the constructor.
    MicrosoftNSJS.Advertising._InterstitialVideoAd.prototype = Object.create(MicrosoftNSJS.Advertising._InterstitialAdBase.prototype);
    Object.defineProperty(MicrosoftNSJS.Advertising._InterstitialVideoAd.prototype, "constructor",
        { value: MicrosoftNSJS.Advertising._InterstitialVideoAd, writable: true, configurable: true, enumerable: true });

    var extendedPrototype = {
        /// <field type="String" locid="MicrosoftNSJS.Advertising._InterstitialDisplayAd.state">
        ///   The current state of the interstitial ad.
        ///   See <c>MicrosoftNSJS.Advertising.InterstitialAdState</c> enumeration.
        /// </field>
        get state() {
            return this._state;
        },

        requestAd: function (applicationId, adUnitId) {
            /// <summary locid="MicrosoftNSJS.Advertising.InterstitialVideoAd.requestAd">
            /// <para>
            ///   A call to this method directs the <c>InterstitialVideoAd</c> to request an ad from the server.
            ///   When an ad has been retrieved successfully, the onAdReady event will fire. 
            ///   If there is a problem retrieving an ad, the onError event will fire instead.
            ///   The ad will not be shown to the user until the <c>show</c> function is called.
            /// </para>
            /// </summary>
            /// <param name="type" type="String" locid="MicrosoftNSJS.Advertising.InterstitialVideoAd.requestAd_p:applicationId">
            ///   The application ID of the app. This value is provided to you when you register the app with PubCenter.
            /// </param>
            /// <param name="type" type="String" locid="MicrosoftNSJS.Advertising.InterstitialVideoAd.requestAd_p:adUnitId">
            ///   The adUnitId as provisioned on PubCenter.
            /// </param>

            if (this._isDisposed || this._requestInProgress || this._state !== MicrosoftNSJS.Advertising.InterstitialAdState.notReady) {
                return;
            }

            this._sendRequest({ applicationId: applicationId, adUnitId: adUnitId, adTags: this._adTags }).then(
                function successHandler(schedule) { },
                function errorHandler(args) { });
        },

        show: function () {
            /// <summary locid="MicrosoftNSJS.Advertising.InterstitialVideoAd.show">
            /// <para>
            ///   If an ad is ready, this call will make it visible to the user.
            /// </para>
            /// </summary>

            if (this._state !== MicrosoftNSJS.Advertising.InterstitialAdState.ready) {
                return;
            }

            if (this._isAnotherAdEngaged()) {
                this._fireErrorOccurredEvent("interstitial ad may not be shown when another ad is already showing", MicrosoftNSJS.Advertising.AdErrorCode.other);
                return;
            }

            if (this._videoElement) {
                this._reportBreakStart();

                this._state = MicrosoftNSJS.Advertising.InterstitialAdState.showing;
                this._isShowing = true;
                this._setEngaged(true);

                this._setupEventHandlers();
                this._setupWindowFocusHandlers();

                this._videoElement.style.visibility = "visible";
                this._videoElement.play();
                this._videoElement.focus();

                this._showAdNotice();
                this._showCloseButton();
                this._showClickThroughButton();
                this._showCountdown();
                this._updateVideoBounds();
                this._startProgressTimeout();
            }
        },

        close: function () {
            /// <summary locid="MicrosoftNSJS.Advertising.InterstitialVideoAd.close">
            /// <para>
            ///   If the ad is currently showing, this function will cause it to be removed and discarded.
            ///   Once closed, an ad may not be shown again.
            /// </para>
            /// </summary>

            if (this._state === MicrosoftNSJS.Advertising.InterstitialAdState.showing) {
                this._setEngaged(false);
            }

            // only fire a complete/cancel event if ad is showing and we are not in error state
            var fireEvent = (this._state === MicrosoftNSJS.Advertising.InterstitialAdState.showing) && !this._isError;

            // if ad is currently playing, consider it cancelled regardless of skipOffset
            var isCancelled = this._currentClip !== null;

            this._clearProgressTimeout();
            this._clearMediaTimeout();

            this._removeVideoElement();
            this._removeAdNotice();
            this._removeCloseButton();
            this._removeClickThroughButton();
            this._removeCountdown();

            this._state = MicrosoftNSJS.Advertising.InterstitialAdState.closed;

            if (fireEvent) {
                if (isCancelled) {
                    this._fireCancelledEvent();
                } else {
                    this._fireCompletedEvent();
                }
            }

            this._clearEventHandlers();
            this._clearWindowFocusHandlers();
        },

        dispose: function () {
            /// <summary locid="MicrosoftNSJS.Advertising.InterstitialVideoAd.dispose">
            /// <para>
            ///   A call to this method directs the <c>InterstitialVideoAd</c> to release resources and unregister listeners.
            /// </para>
            /// </summary>
            /// <remarks>
            ///   The <c>InterstitialVideoAd</c> will not function after this is called. 
            /// </remarks>
            try {
                this._log("InterstitialVideoAd.dispose:s", "dispose");

                this._isDisposed = true;

                // remove event handlers first, since we should not trigger events in dispose
                this._onAdReady = null;
                this._onCompleted = null;
                this._onCancelled = null;
                this._onErrorOccurred = null;

                this.close();

                this._adTags = null;
                this._break = null;
                this._currentClip = null;
                this._globalEventManager = null;

                this._requestInProgress = false;

                this._clearMediaTimeout();
                this._clearEventHandlers();
                this._clearWindowFocusHandlers();

                this._videoElement = null;
                this._closeButton = null;

                this._context = null;

                this._log("InterstitialVideoAd.dispose:e", "dispose");
            }
            catch (err) {
            }
        },

        _getAdSchedulerClass: function () {
            // This just returns a reference to the WinRT class so we can mock it out for testing.
            return Microsoft.Advertising.Shared.WinRT.AdScheduler;
        },

        _getProjectedMediaConstraintsClass: function () {
            // This just returns a reference to the WinRT class.
            return Microsoft.Advertising.Shared.WinRT.ProjectedMediaConstraints;
        },

        _sendRequest: function (params) {
            this._adRequestStartTime = (new Date()).getTime();                   
            return new Promise(function (complete, error, progress) {
                // We have to do some things before triggering the promise's error handler.
                var handleError = function (arg) {
                    this._requestInProgress = false;
                    this._fireErrorOccurredEvent(arg.errorMessage, arg.errorCode)
                    error(arg);
                }.bind(this);

                if (this._requestInProgress) {
                    handleError(this._createErrorArgs(strings.requestAlreadyInProgress, MicrosoftNSJS.Advertising.AdErrorCode.refreshNotAllowed));
                    return;
                }

                try {
                    this._requestInProgress = true;

                    var promise = null;

                    if (params.adUnitId) {                          
                        promise = this._getAdSchedulerClass().getScheduleStrictAsync(params.applicationId,
                        params.adUnitId, this._requestTimeout, Microsoft.Advertising.Shared.WinRT.SdkType.universalVideoWwa,
                        params.adTags, this._context, this._getProjectedMediaConstraintsClass().defaultMediaConstraints);                                                           
                    } else {                                

                        if (this._context !== null && typeof (this._context) !== "undefined")
                        {
                            // reset logger params if a previous appid/adunitid request was made. 
                            // service url should be used for test purposes only.
                            this._context.getLogger().setPublisherId(null);
                            this._context.getLogger().setAdUnitId(null);
                            this._context.getLogger().setASID(null);
                            this._context.getLogger().setSourceUrl(params.serviceUrl);
                            this._context.getLogger().setSdkType(Microsoft.Advertising.Shared.WinRT.SdkType.universalVideoWwa);
                        }
                        promise = this._getAdSchedulerClass().getScheduleStrictAsync(params.serviceUrl,
                          this._requestTimeout, Microsoft.Advertising.Shared.WinRT.SdkType.universalVideoWwa,
                          this._context, this._getProjectedMediaConstraintsClass().defaultMediaConstraints);

                    }

                    promise.then(
                        function (schedule) {
                            this._requestInProgress = false;
                            if (schedule) {
                                if (schedule.error) {
                                    handleError(schedule.error);
                                } else if (schedule.value !== null) {
                                    this._processSchedule(schedule.value);

                                    // success
                                    if (this._break && this._break.getNextClip()) {
                                        this._prepareVideoElement();
                                        complete(schedule.value);
                                    } else {
                                        // No ad received. Possible causes:
                                        // 1. server did not have an ad to serve
                                        // 2. server returned an ad break that was not scheduled for preroll (i.e. was scheduled for non-zero start time)
                                        // 3. server returned ads that did not contain any streams we can play
                                        handleError(this._createErrorArgs("No ad available.", MicrosoftNSJS.Advertising.AdErrorCode.noAdAvailable));
                                    }
                                } else {
                                    handleError(this._createErrorArgs("schedule request returned no information", MicrosoftNSJS.Advertising.AdErrorCode.other));
                                }
                            } else {
                                handleError(this._createErrorArgs("schedule is null", MicrosoftNSJS.Advertising.AdErrorCode.other));
                            }
                        }.bind(this),
                        function (evt) {
                            // When errors occur, the promise "success" handler will be triggered and the returned object
                            // will contain the error details. This error handler should not be triggered.
                            handleError(this._createErrorArgs("error occurred in request promise", MicrosoftNSJS.Advertising.AdErrorCode.other));
                        }.bind(this)
                    );

                }
                catch (e) {
                    handleError(this._createErrorArgs(e.message, MicrosoftNSJS.Advertising.AdErrorCode.other));
                }
            }.bind(this));
        },

        // This is used to create the error arguments for both the errorOccurred event and the
        // error result from a promise.
        _createErrorArgs: function (msg, code) {
            return { errorMessage: msg, errorCode: code };
        },

        _setupWindowFocusHandlers: function () {
            if (this._windowFocusHandlerBound === null) {
                this._windowFocusHandlerBound = this._play.bind(this);
                window.addEventListener("focus", this._windowFocusHandlerBound);
            }
            if (this._windowBlurHandlerBound === null) {
                this._windowBlurHandlerBound = this._pause.bind(this);
                window.addEventListener("blur", this._windowBlurHandlerBound);
            }
        },

        _clearWindowFocusHandlers: function () {
            if (this._windowFocusHandlerBound !== null) {
                window.removeEventListener("focus", this._windowFocusHandlerBound);
                this._windowFocusHandlerBound = null;
            }
            if (this._windowBlurHandlerBound !== null) {
                window.removeEventListener("blur", this._windowBlurHandlerBound);
                this._windowBlurHandlerBound = null;
            }
        },

        _prepareVideoElement: function () {
            if (this._isDisposed) {
                return;
            }

            if (!this._break) {
                // We check that we have a break before we call this function, so this should not happen.
                // Checking here just to be safe.
                this._fireErrorOccurredEvent("ad break is null", MicrosoftNSJS.Advertising.AdErrorCode.other);
                return;
            }

            var clip = this._break.getNextClip();
            if (!clip) {
                // No more clips in the break. This should be checked before this function is called, but 
                // adding check here to be safe.
                this._fireErrorOccurredEvent("no ad found in break", MicrosoftNSJS.Advertising.AdErrorCode.other);
                return;
            }

            this._currentClip = clip;
            this._lastClipTime = 0;

            // Remember what events we have fired for this clip. We only fire progress events once each, even if rewound.
            this._reportedEvents = {};

            this._videoElement = this._createVideoElement();

            if (this._requestTimeout !== 0) {
                // We have a single timeout value for both the ad request and for media playback. Set the media
                // timeout to be the total timeout minus any time already passed for the ad request.
                var timeElapsed = (new Date()).getTime() - this._adRequestStartTime;
                var timeoutRemaining = this._requestTimeout - timeElapsed;
                this._startMediaTimeout(timeoutRemaining);
            }

            // Subscribe to events on the video element
            this._addClipEventListener(this._videoElement, "timeupdate", this._clipTimeUpdate.bind(this));
            this._addClipEventListener(this._videoElement, "ended", this._clipEndedHandler.bind(this));
            this._addClipEventListener(this._videoElement, "error", this._clipErrorHandler.bind(this));
            this._addClipEventListener(this._videoElement, "durationchange", this._clipDurationChangeHandler.bind(this));
            this._addClipEventListener(this._videoElement, "blur", this._blurHandler.bind(this));

            this._addClipEventListener(this._videoElement, "canplay", function (evt) {
                this._clearMediaTimeout();
                this._state = MicrosoftNSJS.Advertising.InterstitialAdState.ready;
                this._fireAdReadyEvent();
                this._removeClipEventListener(evt.srcElement, "canplay");
            }.bind(this));

            //Adding event listener on document since adding on VideoElement requires it to be in focus
            document.addEventListener("keyup", this._keyTapHandler.bind(this));
            this._addClipEventListener(this._videoElement, "click", function (evt) {
                this._showHideCloseButton();
            }.bind(this));

            this._videoElement.src = clip.url;
            document.body.appendChild(this._videoElement);
        },

        _blurHandler: function (evt) {
            if (this.state === MicrosoftNSJS.Advertising.InterstitialAdState.showing) {
                var active = document.activeElement;
                if (active !== null && active !== this._videoElement && active !== this._clickThroughElement) {
                    // Focus is not on our elements, so force it back to video.
                    this._videoElement.focus();
                }
            }
        },

        _keyTapHandler: function (evt) {
            // Except ESC and TAB, show/hide back button
            if (evt.keyCode !== 27 && evt.keyCode !== 9) {
                this._showHideCloseButton();
            }
        },

        _showHideCloseButton: function () {
            if (this._closeButton) {
                this._closeButton.isVisible = !this._closeButton.isVisible;
            }
        },

        _changeAd: function (clip) {
            // Reset the ad-specific variables (e.g. what events were already reported)
            // and start playback of the next ad.
            this._currentClip = clip;
            this._lastClipTime = 0;
            this._reportedEvents = {};
            this._videoElement.src = clip.url;
            this._videoElement.play();

            // remove and (if necessary) recreate the click-through button
            this._removeClickThroughButton();
            this._showClickThroughButton();
        },

        _createVideoElement: function () {
            var bounds = this._getBounds();

            var video = document.createElement("video");
            video.id = "interstitialAd";
            video.style.backgroundColor = "black";
            video.style.top = bounds.y + "px";
            video.style.left = bounds.x + "px";
            video.style.zIndex = this._videoZIndex;
            video.style.position = "absolute";
            video.style.width = bounds.width + "px";
            video.style.height = bounds.height + "px";
            video.marginwidth = "0px";
            video.marginheight = "0px";
            video.frameBorder = "0px";
            video.hideFocus = true;

            video.autoplay = false;
            video.preload = "auto";

            video.style.visibility = "hidden";

            return video;
        },

        _showCloseButton: function () {
            if (this._closeButton) {
                return;
            }
            try {
                var closeButton = new MicrosoftNSJS.Advertising.BackButton(null, { id: "adCloseButtonDiv", isVisible: false });
                document.body.appendChild(closeButton.element);
                closeButton.onClick = function () {
                    this.close();
                }.bind(this);
                this._closeButton = closeButton;

                this._updateVideoBounds();
            }
            catch (err) {
            }
        },

        _removeCloseButton: function () {
            if (this._closeButton) {
                MicrosoftNSJS.Advertising.AdUtilities.removeFromDOM(this._closeButton.element);
            }
            this._closeButton = null;
        },

        _showAdNotice: function () {
            if (this._adNoticeElement) {
                return;
            }

            var adNotice = document.createElement("div");
            adNotice.id = "adNoticeDiv";
            adNotice.innerText = MicrosoftNSJS.Advertising.AdUtilities.getLocalizedString("Advertisement");
            adNotice.style.position = "absolute";
            adNotice.style.width = "200px";
            adNotice.style.fontFamily = "Segoe UI";
            adNotice.style.fontSize = "12pt";
            adNotice.style.color = "#FFFFFF";
            adNotice.style.backgroundColor = "transparent";
            adNotice.style.zIndex = this._videoZIndex + 1; // 1 higher than the video itself
            adNotice.style.textAlign = "center";

            document.body.appendChild(adNotice);
            this._adNoticeElement = adNotice;

            this._updateVideoBounds();
        },

        _removeAdNotice: function () {
            if (this._adNoticeElement) {
                MicrosoftNSJS.Advertising.AdUtilities.removeFromDOM(this._adNoticeElement);
            }
            this._adNoticeElement = null;
        },

        _showClickThroughButton: function () {
            if (this._clickThroughElement) {
                return;
            }

            if (this._currentClip && this._currentClip._package && this._currentClip._package.clickThroughUrl &&
                MicrosoftNSJS.Advertising.AdUtilities.isValidLaunchUri(this._currentClip._package.clickThroughUrl)) {
                var ctButton = document.createElement("div");
                ctButton.id = "adClickThroughButton";
                ctButton.innerText = MicrosoftNSJS.Advertising.AdUtilities.getLocalizedString("LearnMore");
                ctButton.style.position = "absolute";
                ctButton.style.fontFamily = "Segoe UI Semibold";
                ctButton.style.padding = "6px 8px";
                ctButton.style.whiteSpace = "nowrap";
                ctButton.style.color = "white";
                ctButton.style.backgroundColor = "rgba(0,0,0,0.1)";
                ctButton.style.zIndex = this._videoZIndex + 1; // 1 higher than the video itself
                ctButton.style.fontSize = "14pt";
                ctButton.style.textAlign = "center";
                ctButton.style.border = "1px solid white";
                ctButton.tabIndex = 0;
                ctButton.onclick = this._clipClickHandler.bind(this);
                ctButton.onkeyup = function (key) {
                    // If Enter was pressed, treat it as Click
                    if (key.keyCode == 13) {
                        ctButton.click();
                    }
                }.bind(this);
                ctButton.onblur = this._blurHandler.bind(this);
                document.body.appendChild(ctButton);
                this._clickThroughElement = ctButton;

                this._updateVideoBounds();
            }
        },

        _removeClickThroughButton: function () {
            if (this._clickThroughElement) {
                this._clickThroughElement.onblur = null;
                this._clickThroughElement.onclick = null;
                this._clickThroughElement.onkeyup = null;
                MicrosoftNSJS.Advertising.AdUtilities.removeFromDOM(this._clickThroughElement);
            }
            this._clickThroughElement = null;
        },

        _processSchedule: function (schedule) {
            // Steps through the schedule object returned from the server and populates a Break/Clip objects which
            // are used to track ad progress.
            for (var i = 0; i < schedule.pods.length; i++) {
                var pod = schedule.pods[i];
                this._log("pod: id=" + pod.id + ", time=" + pod.time, "_processSchedule");
                // make sure this pod is scheduled for time 0, which should be true for all pods in a payload targeted at interstitial
                if (this._isPreroll(pod.time)) {
                    var newBreak = new MicrosoftNSJS.Advertising.Break({ startTime: pod.time, podId: pod.id, _pod: pod });

                    // We only track the first preroll break we find.
                    if (!this._break) {
                        this._break = newBreak;
                    } else {
                        this._log("second preroll pod will be ignored", "_processSchedule");
                        continue;
                    }

                    for (var j = 0; j < pod.packages.length; j++) {
                        var pkg = pod.packages[j];

                        // The package may not have any ads matched by the server, in which case there will be no videos.
                        if (pkg.video && pkg.video.length > 0) {
                            var clip = this._createClip(pod, pkg);
                            if (clip) {
                                this._log("clip: url=" + clip.url + ", duration=" + clip.duration, "_processSchedule");
                                newBreak.addClip(clip);
                            }
                        }
                    }
                }
            }
        },

        _createClip: function (pod, pkg) {
            var media = this._selectMedia(pkg.video);
            if (!media) {
                this._reportError(pkg, MicrosoftNSJS.Advertising._InterstitialVideoAd.VastErrorCode.noSupportedMedia);
                return null;
            }

            var clip = new MicrosoftNSJS.Advertising.Clip({
                timeOffset: pod.time,
                type: "video",
                url: media.uri,
                skipOffset: pkg.skipOffset,
                podId: pod.id,
                duration: MicrosoftNSJS.Advertising.AdUtilities.hhmmssToSeconds(pkg.duration),
                _package: pkg,
                _pod: pod,
            });
            return clip;
        },

        _selectMedia: function (mediaFiles) {
            var maxBitrate = (MicrosoftNSJS.Advertising.AdUtilities.isNetworkMetered() ? this._maxMeteredBitrate : null);
            var screenWidth = Math.max(document.documentElement.offsetWidth, document.documentElement.offsetHeight);
            var bestScore = Infinity;

            // This checks for the highest resolution stream subject to bitrate and format constraints.
            var bestFile = null;
            for (var ix = 0; ix < mediaFiles.length; ix++) {
                var file = mediaFiles[ix];
                var score = Math.abs((file.width - screenWidth) / (screenWidth));

                if (maxBitrate && file.bitrate > maxBitrate) {
                    this._log("stream bitrate too high: " + file.bitrate, "_selectMedia");
                    continue;
                }

                if (!MicrosoftNSJS.Advertising._InterstitialVideoAd.canPlayType(file.type)) {
                    this._log("unsupported file type: " + file.type, "_selectMedia");
                    continue;
                }

                if (bestFile === null || score < bestScore || (score === bestScore && file.width > bestFile.width)) {
                    bestScore = score;
                    bestFile = file;
                }
            }

            if (bestFile) {
                this._log("selected file: width=" + bestFile.width + ", kbps=" + bestFile.bitrate + ", score=" + bestScore + ", url: " + bestFile.uri, "_selectMedia");
            }

            return bestFile;
        },

        _isPreroll: function (timeOffset) {
            // This checks whether the specified timeOffset indicates the ad should start at time 0, before app content.
            if (timeOffset === "start" || timeOffset === "0%") {
                return true;
            }
            var parsed = MicrosoftNSJS.Advertising.AdUtilities.hhmmssToSeconds(timeOffset);
            return (parsed === 0);
        },

        // Add a media event listener for a scheduled clip. This method keeps a list of the handlers so they can be unsubscribed later.
        _addClipEventListener: function (mediaElement, eventName, handler) {
            if (mediaElement) {
                mediaElement.addEventListener(eventName, handler, false);
                this._clipEventSubscriptions.push({ eventName: eventName, handler: handler });
            }
        },

        // Unsubscribe a specific media event.
        _removeClipEventListener: function (mediaElement, eventName) {
            if (mediaElement) {
                for (var ix = 0; ix < this._clipEventSubscriptions.length; ix++) {
                    if (eventName === this._clipEventSubscriptions[ix].eventName) {
                        mediaElement.removeEventListener(eventName, this._clipEventSubscriptions[ix].handler);
                        this._clipEventSubscriptions.splice(ix, 1);
                        break;
                    }
                }
            }
        },

        // Unsubscribe from previously subscribed media events.
        _removeAllClipEventListeners: function (mediaElement) {
            if (mediaElement) {
                var mediaEventSubscriptionsLength = this._clipEventSubscriptions.length;
                for (var i = 0; i < mediaEventSubscriptionsLength; i++) {
                    mediaElement.removeEventListener(this._clipEventSubscriptions[i].eventName, this._clipEventSubscriptions[i].handler);
                }
            }
            this._clipEventSubscriptions = [];
        },

        _launchUri: function (u) {
            if (MicrosoftNSJS.Advertising.AdUtilities.isValidLaunchUri(u)) {
                try {
                    var uri = new Windows.Foundation.Uri(u);
                    Windows.System.Launcher.launchUriAsync(uri);
                }
                catch (err) {
                    // invalid URI string will cause Uri constructor to throw error
                }
            }
        },

        // Handlers for video element events

        _clipClickHandler: function (evt) {
            if(this._currentClip && this._currentClip._package) {
                var pkg = this._currentClip._package;
                if (pkg.clickThroughUrl) {
                    this._log("reporting clickTracking", "_clipClickHandler");
                    pkg.reportAsync("clickTracking");
                    this._launchUri(pkg.clickThroughUrl);
                }
            }
        },

        _startProgressTimeout: function () {
            this._progressTimeoutTimerId = setInterval(function () {
                if (this._videoElement) {
                    if (this._videoElement.currentTime === this._previousProgress && !this._videoElement.paused) {
                        this._secondsSinceLastProgress += 1;
                    } else {
                        this._previousProgress = this._videoElement.currentTime;
                        this._secondsSinceLastProgress = 0;
                    }

                    if (this._secondsSinceLastProgress === MicrosoftNSJS.Advertising._InterstitialVideoAd._progressTimeoutSeconds) {
                        this._clipErrorHandler(
                        {
                            errorMessage: strings.mediaTimeout,
                            errorCode: MicrosoftNSJS.Advertising.AdErrorCode.networkConnectionFailure
                        });
                    }
                }
            }.bind(this), 1000);
        },

        _clearProgressTimeout: function () {
            if (this._progressTimeoutTimerId) {
                clearInterval(this._progressTimeoutTimerId);
                this._progressTimeoutTimerId = null;
            }
        },

        _startMediaTimeout: function (timeoutMS) {
            if (timeoutMS !== 0 && !this._isDisposed) {
                this._clearMediaTimeout();
                this._mediaTimeoutTimerId = setTimeout(function () {
                    this._mediaTimeoutTimerId = null;
                    if (this._videoElement) {
                        this._clipErrorHandler(
                            {
                                errorMessage: strings.mediaTimeout,
                                errorCode: MicrosoftNSJS.Advertising.AdErrorCode.networkConnectionFailure
                            });
                    }
                }.bind(this), timeoutMS);
            }
        },

        _clearMediaTimeout: function () {
            if (this._mediaTimeoutTimerId && typeof (this._mediaTimeoutTimerId) === "number") {
                clearTimeout(this._mediaTimeoutTimerId);
                this._mediaTimeoutTimerId = null;
            }
        },

        _clipErrorHandler: function (evt) {
            var errorMessage = null;

            if (evt.target && evt.target.error) {
                // We are handling a MediaError event, so determine the specific problem.
                var mediaErr = evt.target.error;
                var vastErrorCode = MicrosoftNSJS.Advertising._InterstitialVideoAd.VastErrorCode.generalLinearError;

                // msExtendedCode provides more precise explanation of what error occurred
                switch (mediaErr.msExtendedCode) {
                    case -1072889830: //0xC00D001A
                        errorMessage = "media url not found";
                        vastErrorCode = MicrosoftNSJS.Advertising._InterstitialVideoAd.VastErrorCode.fileNotFound;
                        break;
                    case -1072875836: //0xC00D36C4
                        errorMessage = "media format not recognized";
                        vastErrorCode = MicrosoftNSJS.Advertising._InterstitialVideoAd.VastErrorCode.unableToPlayFile;
                        break;
                    case -1072889803: //0xC00D2EE7 Windows
                    case -2147012889: //0x80072EE7 WP
                        errorMessage = "media server unknown";
                        vastErrorCode = MicrosoftNSJS.Advertising._InterstitialVideoAd.VastErrorCode.unableToPlayFile;
                        break;
                    default:
                        switch (mediaErr.code) {
                            case MediaError.MEDIA_ERR_ABORTED:
                                errorMessage = "media aborted error";
                                vastErrorCode = MicrosoftNSJS.Advertising._InterstitialVideoAd.VastErrorCode.generalLinearError;
                                break;
                            case MediaError.MEDIA_ERR_DECODE:
                                errorMessage = "media decode error";
                                vastErrorCode = MicrosoftNSJS.Advertising._InterstitialVideoAd.VastErrorCode.unableToPlayFile;
                                break;
                            case MediaError.MEDIA_ERR_NETWORK:
                                errorMessage = "media network error";
                                vastErrorCode = MicrosoftNSJS.Advertising._InterstitialVideoAd.VastErrorCode.generalLinearError;
                                break;
                            case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                                errorMessage = "media src not supported";
                                vastErrorCode = MicrosoftNSJS.Advertising._InterstitialVideoAd.VastErrorCode.unableToPlayFile;
                                break;
                            default:
                                errorMessage = "media error code: " + mediaErr.code;
                                vastErrorCode = MicrosoftNSJS.Advertising._InterstitialVideoAd.VastErrorCode.generalLinearError;
                                break;
                        }
                }
            } else {
                // We are called from the media timeout logic. Use the parameter's errorMessage.
                errorMessage = evt.errorMessage ? evt.errorMessage : "An error occurred during media playback.";
                vastErrorCode = MicrosoftNSJS.Advertising._InterstitialVideoAd.VastErrorCode.mediaTimeout
            }

            var errorCode = evt.errorCode ? evt.errorCode : MicrosoftNSJS.Advertising.AdErrorCode.other;

            if (this._currentClip) {
                this._reportError(this._currentClip._package, vastErrorCode);
            }

            // Remove the current ad which had the error.
            this._clipEnded(true);

            // Fire the errorOccurred event to indicate ad has failed. Do this after we remove
            // the ad by calling _clipEnded, since that will report any remaining events to server,
            // and if we report error to app it may dispose of us immediately.
            this._fireErrorOccurredEvent(errorMessage, errorCode);
        },

        _clipDurationChangeHandler: function (sender, args) {
            if (this._currentClip && !this._isDisposed && this._videoElement) {
                this._currentClip.duration = this._videoElement.duration;
                this._break.updateRemainingDuration();
            }
        },

        _clipTimeUpdate: function () {
            if (this._currentClip && !this._isDisposed) {
                var currentTime = this._videoElement.currentTime;

                this._updateCountdown(currentTime);

                // If duration has not been set, try to determine it now.
                if (!this._currentClip.duration) {
                    if (this._videoElement && this._videoElement.duration > 0) {
                        this._currentClip.duration = this._videoElement.duration;
                    }
                }

                // If we still don't know the duration, return now. The rest of this function requires it.
                if (this._currentClip.duration && this._currentClip.duration !== 0) {
                    this._checkProgressEvents(currentTime, this._currentClip.duration);
                }

                this._lastClipTime = currentTime;
            }
        },

        _checkProgressEvents: function (currentTime, duration) {
            this._fireEventIfTimeReached(currentTime, 0, MicrosoftNSJS.Advertising.MediaProgress.start);
            this._fireEventIfTimeReached(currentTime, 0.25 * duration, MicrosoftNSJS.Advertising.MediaProgress.firstQuartile);
            this._fireEventIfTimeReached(currentTime, 0.5 * duration, MicrosoftNSJS.Advertising.MediaProgress.midpoint);
            this._fireEventIfTimeReached(currentTime, 0.75 * duration, MicrosoftNSJS.Advertising.MediaProgress.thirdQuartile);
            // The complete event is fired in the _clipEnded function. No need to check here.
        },

        _fireEventIfTimeReached: function (currentTime, targetTime, progressEnum) {
            if (this._lastClipTime <= targetTime && targetTime <= currentTime) {
                this._reportQuartile(this._currentClip, progressEnum);
            }
        },

        // Event handler for the actual video "ended" event.
        _clipEndedHandler: function (evt) {
            this._clipEnded(false);
        },

        _clipEnded: function (errorOccurred) {
            this._clearMediaTimeout();

            if (this._currentClip) {
                var currentClip = this._currentClip;

                this._currentClip.isPlayed = true;
                this._currentClip = null;

                if (this._break) {
                    this._break.updateRemainingDuration();
                }

                if (!errorOccurred) {
                    this._reportQuartile(currentClip, MicrosoftNSJS.Advertising.MediaProgress.complete);
                }

                // Check for additional clips in this same break unless error occurred.
                var clip = (!errorOccurred && this._break ? this._break.getNextClip() : null);

                if (clip === null) {
                    // Clip may have ended before it was even shown if error occurred in loading the video. 
                    // Only report breakEnd if break had started (i.e. ad was shown).
                    if (this._state === MicrosoftNSJS.Advertising.InterstitialAdState.showing) {
                        this._reportBreakEnd(this._break);
                    }
                    this._break = null;
                    this._isError = (errorOccurred === true);
                    this.close();
                } else {
                    // There are more ads to show.
                    this._changeAd(clip);
                }
            }
        },

        _reportBreakStart: function (brk) {
            // Report the breakStart event to the server, if payload contained any tracking URLs.
            this._log("reporting breakStart", "_reportBreakStart");
            if (this._break && this._break._pod) {
                this._break._pod.reportAsync(MicrosoftNSJS.Advertising._InterstitialVideoAd.AdBreakEvent.breakStart);
            }
        },

        _reportBreakEnd: function (brk) {
            // Report the breakEnd event to the server, if payload contained any tracking URLs.
            this._log("reporting breakEnd", "_reportBreakEnd");
            if (this._break && this._break._pod) {
                this._break._pod.reportAsync(MicrosoftNSJS.Advertising._InterstitialVideoAd.AdBreakEvent.breakEnd);
            }
        },

        _reportQuartile: function (clip, progressEnum) {
            if (this._reportedEvents[progressEnum]) {
                // we have already reported this quartile. Repeats can occur if video timeUpdate event repeats the 
                // same time which can happen if video requires buffering.
                return;
            }

            this._reportedEvents[progressEnum] = true;

            var pkg = clip && clip._package;
            if (pkg) {
                if (progressEnum === MicrosoftNSJS.Advertising.MediaProgress.start) {
                    // When the video starts, also fire the impression and creativeView events.
                    this._log("reporting impression", "_reportQuartile");
                    pkg.reportAsync("impression");

                    this._log("reporting creativeView", "_reportQuartile");
                    pkg.reportAsync("creativeView");
                }

                this._log("reporting progress: " + progressEnum, "_reportQuartile");
                pkg.reportAsync(progressEnum);
            }
        },

        _reportPause: function () {
            if (this._currentClip && this._currentClip._package) {
                this._log("reporting pause", "_reportPause");
                this._currentClip._package.reportAsync("pause");
            }
        },

        _reportResume: function () {
            if (this._currentClip && this._currentClip._package) {
                this._log("reporting resume", "_reportResume");
                this._currentClip._package.reportAsync("resume");
            }
        },

        _reportError: function (pkg, vastErrorCode) {
            if (pkg) {
                this._log("reporting error: " + vastErrorCode, "_reportError");

                var params = new Windows.Foundation.Collections.PropertySet();
                if (vastErrorCode) {
                    params.insert("[ERRORCODE]", vastErrorCode);
                    params.insert("%5BERRORCODE%5D", vastErrorCode);
                }

                pkg.reportAsync("error", params.getView());
            }
        },

        _removeVideoElement: function () {
            if (this._videoElement) {
                this._removeAllClipEventListeners(this._videoElement);
                document.removeEventListener("keyup", this._keyTapHandler);
                this._videoElement.removeAttribute("src");
                this._videoElement.style.visibility = "hidden";
                MicrosoftNSJS.Advertising.AdUtilities.removeFromDOM(this._videoElement);
                this._videoElement = null;
            }
        },

        _documentResizeHandler: function () {
            if (!this._isDisposed) {
                this._updateVideoBounds();
            }
        },

        _pause: function () {
            if (this._videoElement && this._state === MicrosoftNSJS.Advertising.InterstitialAdState.showing && !this._videoElement.paused) {
                this._videoElement.pause();
                this._reportPause();
            }
        },

        _play: function () {
            if (this._videoElement && this._state === MicrosoftNSJS.Advertising.InterstitialAdState.showing && this._videoElement.paused) {
                this._videoElement.play();
                this._reportResume();
            }
        },

        _updateVideoBounds: function () {
            // Updates the video element so that it fills the entire screen.
            var bounds = this._getBounds();

            if (this._videoElement) {
                this._videoElement.style.left = "0px";
                this._videoElement.style.top = "0px";
                this._videoElement.style.width = bounds.width + "px";
                this._videoElement.style.height = bounds.height + "px";
            }

            if (this._closeButton) {
                this._closeButton.element.style.left = "20px";
                this._closeButton.element.style.top = "20px";
            }

            if (this._clickThroughElement) {
                this._clickThroughElement.style.left = (bounds.width - this._clickThroughElement.offsetWidth - 20) + "px";
                this._clickThroughElement.style.top = (bounds.height - this._clickThroughElement.offsetHeight - 20) + "px";
            }

            if (this._adNoticeElement) {
                this._adNoticeElement.style.left = (bounds.width - this._adNoticeElement.offsetWidth) / 2 + "px";
                this._adNoticeElement.style.top = "20px";
            }

            if (this._countdownElement) {
                this._countdownElement.style.left = "20px";
                this._countdownElement.style.top = (bounds.height - this._countdownElement.offsetHeight - 20) + "px";
            }
        },

        _createCountdownElement: function () {
            var elem = document.createElement("div");
            elem.id = "adCountdownElem";
            elem.style.position = "absolute";
            elem.style.width = "100px";
            elem.style.margin = "0px";
            elem.style.height = "25px";
            elem.style.fontFamily = "Segoe UI Semibold";
            elem.style.fontSize = "12pt";
            elem.style.color = "#FFFFFF";
            elem.style.backgroundColor = "transparent";
            elem.style.zIndex = this._videoZIndex + 1; // 1 higher than the video itself
            return elem;
        },

        _showCountdown: function () {
            if (!this._countdownElement) {
                this._countdownElement = this._createCountdownElement();
                document.body.appendChild(this._countdownElement);
            }
        },

        _removeCountdown: function () {
            if (this._countdownElement) {
                MicrosoftNSJS.Advertising.AdUtilities.removeFromDOM(this._countdownElement);
                this._countdownElement = null;
            }
        },
                
        _updateCountdown: function (currentTime) {
            if (this._countdownElement && this._break) {
                this._countdownElement.innerHTML = Math.ceil(this._break.remainingDuration - currentTime);
            }
        }
    };

    // Merge the above new prototype members into the class prototype.
    function mergeExtended(target, members) {
        var keys = Object.getOwnPropertyNames(members);
        var i, len;
        for (var ix = 0; ix < keys.length; ix++) {
            var key = keys[ix];
            var memberProperty = Object.getOwnPropertyDescriptor(members, key);
            Object.defineProperty(target, key, memberProperty);
        }
    }

    mergeExtended(MicrosoftNSJS.Advertising._InterstitialVideoAd.prototype, extendedPrototype);

    MicrosoftNSJS.Advertising._InterstitialVideoAd._defaultAdRequestTimeoutMs = 30000;

    MicrosoftNSJS.Advertising._InterstitialVideoAd._progressTimeoutSeconds = 5;

    MicrosoftNSJS.Advertising._InterstitialVideoAd.canPlayType = function (mimeType) {
        mimeType = (mimeType ? mimeType.toLowerCase() : "");
        var supportedMimeTypes = Microsoft.Advertising.Shared.WinRT.ProjectedMediaConstraints.defaultMediaConstraints.supportedMimeTypes;
        for (var ix = 0; ix < supportedMimeTypes.size; ix++) {
            if (mimeType === supportedMimeTypes.getAt(ix).toLowerCase()) {
                return true;
            }
        }
        return false;
    };

    MicrosoftNSJS.Advertising._InterstitialVideoAd.AdBreakEvent = {
        breakStart: "breakStart",
        breakEnd: "breakEnd",
        error: "error"
    };

    MicrosoftNSJS.Advertising._InterstitialVideoAd.VastErrorCode = {
        generalLinearError: "400",
        fileNotFound: "401",
        mediaTimeout: "402",
        noSupportedMedia: "403",
        unableToPlayFile: "405"
    };

    var strings = {
        get requestAlreadyInProgress() { return "request is already in progress"; },
        get mediaTimeout() { return "media request has timed out"; },
    };

})();

// SIG // Begin signature block
// SIG // MIIdowYJKoZIhvcNAQcCoIIdlDCCHZACAQExCzAJBgUr
// SIG // DgMCGgUAMGcGCisGAQQBgjcCAQSgWTBXMDIGCisGAQQB
// SIG // gjcCAR4wJAIBAQQQEODJBs441BGiowAQS9NQkAIBAAIB
// SIG // AAIBAAIBAAIBADAhMAkGBSsOAwIaBQAEFBDx5tuvNKu1
// SIG // MvqYtm7LBmKo4TUEoIIYZTCCBMMwggOroAMCAQICEzMA
// SIG // AADIRyKdow3KwFgAAAAAAMgwDQYJKoZIhvcNAQEFBQAw
// SIG // dzELMAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0
// SIG // b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1p
// SIG // Y3Jvc29mdCBDb3Jwb3JhdGlvbjEhMB8GA1UEAxMYTWlj
// SIG // cm9zb2Z0IFRpbWUtU3RhbXAgUENBMB4XDTE2MDkwNzE3
// SIG // NTg1NFoXDTE4MDkwNzE3NTg1NFowgbMxCzAJBgNVBAYT
// SIG // AlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQH
// SIG // EwdSZWRtb25kMR4wHAYDVQQKExVNaWNyb3NvZnQgQ29y
// SIG // cG9yYXRpb24xDTALBgNVBAsTBE1PUFIxJzAlBgNVBAsT
// SIG // Hm5DaXBoZXIgRFNFIEVTTjo5OEZELUM2MUUtRTY0MTEl
// SIG // MCMGA1UEAxMcTWljcm9zb2Z0IFRpbWUtU3RhbXAgU2Vy
// SIG // dmljZTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoC
// SIG // ggEBAKFDTcpJ4SHEMleKEDuPnLvcHXi3OtuHvVtG8Ag5
// SIG // x6XcSarRBpL+3/tJGKcmJPK6Xwnvh9mgrgORdF6BVi0p
// SIG // DrGoxNZ/zEVQB9uLJS2D8mf1zu1oDBr20kTi/e3sEkWS
// SIG // BJBZtnQgdQ0Qznn+2VcOgzIa5eYfLNvfXg8RMoca2OIt
// SIG // L0GSisAw9/MZTF3YXNlCRgNBmdegciTBkMwarLkcr8QB
// SIG // qyzUuZowqaIBLSSuQgpuwujvOGVklTfDnvsOv4oCm6vb
// SIG // xCfIvEOFaIQHED9FaVvmIN6pqBjAr2+A1UUkDHibK3s6
// SIG // GO2zSY6YnFXqPetr0Mn9PW90kxfnKqY+gF8xlVcCAwEA
// SIG // AaOCAQkwggEFMB0GA1UdDgQWBBQP4WX92I3DlqYo8NLf
// SIG // no09qn1ezDAfBgNVHSMEGDAWgBQjNPjZUkZwCu1A+3b7
// SIG // syuwwzWzDzBUBgNVHR8ETTBLMEmgR6BFhkNodHRwOi8v
// SIG // Y3JsLm1pY3Jvc29mdC5jb20vcGtpL2NybC9wcm9kdWN0
// SIG // cy9NaWNyb3NvZnRUaW1lU3RhbXBQQ0EuY3JsMFgGCCsG
// SIG // AQUFBwEBBEwwSjBIBggrBgEFBQcwAoY8aHR0cDovL3d3
// SIG // dy5taWNyb3NvZnQuY29tL3BraS9jZXJ0cy9NaWNyb3Nv
// SIG // ZnRUaW1lU3RhbXBQQ0EuY3J0MBMGA1UdJQQMMAoGCCsG
// SIG // AQUFBwMIMA0GCSqGSIb3DQEBBQUAA4IBAQCalA8osgfe
// SIG // 4wPVPb6exzqvC8wiH2FbUHyYuT1Mya6cM7+ge2qEwvog
// SIG // q/EHYjBuxmsnfHlqwtAcZispUzv5Uqz2dP9xGX+G81RG
// SIG // lHwLQoZODo7+4igj6yNEQYGdPrUD2Bk44qnbkKNruMZt
// SIG // BmzfUSkYjTW9SAmnSdYZH9rswT4+yFS7YVeRan6vSprY
// SIG // 1g3qnstkAQgBvTMQKjKOhKXtCA28FVG0htj8zPqy0ie7
// SIG // PKfv68Qmzxi4sVpQLbmNqhZ9Nf9n17UmsYUuLzc6RYTv
// SIG // 8//puXx5v4//PMs0b0H1qbZUJUkXb8Du9lXPjW769vZz
// SIG // TcOuthsQ2xw7hjd0uua4z7AJMIIGBzCCA++gAwIBAgIK
// SIG // YRZoNAAAAAAAHDANBgkqhkiG9w0BAQUFADBfMRMwEQYK
// SIG // CZImiZPyLGQBGRYDY29tMRkwFwYKCZImiZPyLGQBGRYJ
// SIG // bWljcm9zb2Z0MS0wKwYDVQQDEyRNaWNyb3NvZnQgUm9v
// SIG // dCBDZXJ0aWZpY2F0ZSBBdXRob3JpdHkwHhcNMDcwNDAz
// SIG // MTI1MzA5WhcNMjEwNDAzMTMwMzA5WjB3MQswCQYDVQQG
// SIG // EwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UE
// SIG // BxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENv
// SIG // cnBvcmF0aW9uMSEwHwYDVQQDExhNaWNyb3NvZnQgVGlt
// SIG // ZS1TdGFtcCBQQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IB
// SIG // DwAwggEKAoIBAQCfoWyx39tIkip8ay4Z4b3i48WZUSNQ
// SIG // rc7dGE4kD+7Rp9FMrXQwIBHrB9VUlRVJlBtCkq6YXDAm
// SIG // 2gBr6Hu97IkHD/cOBJjwicwfyzMkh53y9GccLPx754gd
// SIG // 6udOo6HBI1PKjfpFzwnQXq/QsEIEovmmbJNn1yjcRlOw
// SIG // htDlKEYuJ6yGT1VSDOQDLPtqkJAwbofzWTCd+n7Wl7Po
// SIG // IZd++NIT8wi3U21StEWQn0gASkdmEScpZqiX5NMGgUqi
// SIG // +YSnEUcUCYKfhO1VeP4Bmh1QCIUAEDBG7bfeI0a7xC1U
// SIG // n68eeEExd8yb3zuDk6FhArUdDbH895uyAc4iS1T/+QXD
// SIG // wiALAgMBAAGjggGrMIIBpzAPBgNVHRMBAf8EBTADAQH/
// SIG // MB0GA1UdDgQWBBQjNPjZUkZwCu1A+3b7syuwwzWzDzAL
// SIG // BgNVHQ8EBAMCAYYwEAYJKwYBBAGCNxUBBAMCAQAwgZgG
// SIG // A1UdIwSBkDCBjYAUDqyCYEBWJ5flJRP8KuEKU5VZ5KSh
// SIG // Y6RhMF8xEzARBgoJkiaJk/IsZAEZFgNjb20xGTAXBgoJ
// SIG // kiaJk/IsZAEZFgltaWNyb3NvZnQxLTArBgNVBAMTJE1p
// SIG // Y3Jvc29mdCBSb290IENlcnRpZmljYXRlIEF1dGhvcml0
// SIG // eYIQea0WoUqgpa1Mc1j0BxMuZTBQBgNVHR8ESTBHMEWg
// SIG // Q6BBhj9odHRwOi8vY3JsLm1pY3Jvc29mdC5jb20vcGtp
// SIG // L2NybC9wcm9kdWN0cy9taWNyb3NvZnRyb290Y2VydC5j
// SIG // cmwwVAYIKwYBBQUHAQEESDBGMEQGCCsGAQUFBzAChjho
// SIG // dHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtpL2NlcnRz
// SIG // L01pY3Jvc29mdFJvb3RDZXJ0LmNydDATBgNVHSUEDDAK
// SIG // BggrBgEFBQcDCDANBgkqhkiG9w0BAQUFAAOCAgEAEJeK
// SIG // w1wDRDbd6bStd9vOeVFNAbEudHFbbQwTq86+e4+4LtQS
// SIG // ooxtYrhXAstOIBNQmd16QOJXu69YmhzhHQGGrLt48ovQ
// SIG // 7DsB7uK+jwoFyI1I4vBTFd1Pq5Lk541q1YDB5pTyBi+F
// SIG // A+mRKiQicPv2/OR4mS4N9wficLwYTp2OawpylbihOZxn
// SIG // LcVRDupiXD8WmIsgP+IHGjL5zDFKdjE9K3ILyOpwPf+F
// SIG // ChPfwgphjvDXuBfrTot/xTUrXqO/67x9C0J71FNyIe4w
// SIG // yrt4ZVxbARcKFA7S2hSY9Ty5ZlizLS/n+YWGzFFW6J1w
// SIG // lGysOUzU9nm/qhh6YinvopspNAZ3GmLJPR5tH4LwC8cs
// SIG // u89Ds+X57H2146SodDW4TsVxIxImdgs8UoxxWkZDFLyz
// SIG // s7BNZ8ifQv+AeSGAnhUwZuhCEl4ayJ4iIdBD6Svpu/RI
// SIG // zCzU2DKATCYqSCRfWupW76bemZ3KOm+9gSd0BhHudiG/
// SIG // m4LBJ1S2sWo9iaF2YbRuoROmv6pH8BJv/YoybLL+31HI
// SIG // jCPJZr2dHYcSZAI9La9Zj7jkIeW1sMpjtHhUBdRBLlCs
// SIG // lLCleKuzoJZ1GtmShxN1Ii8yqAhuoFuMJb+g74TKIdbr
// SIG // Hk/Jmu5J4PcBZW+JC33Iacjmbuqnl84xKf8OxVtc2E0b
// SIG // odj6L54/LlUWa8kTo/0wggYRMIID+aADAgECAhMzAAAA
// SIG // joeRpFcaX8o+AAAAAACOMA0GCSqGSIb3DQEBCwUAMH4x
// SIG // CzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9u
// SIG // MRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNy
// SIG // b3NvZnQgQ29ycG9yYXRpb24xKDAmBgNVBAMTH01pY3Jv
// SIG // c29mdCBDb2RlIFNpZ25pbmcgUENBIDIwMTEwHhcNMTYx
// SIG // MTE3MjIwOTIxWhcNMTgwMjE3MjIwOTIxWjCBgzELMAkG
// SIG // A1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAO
// SIG // BgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29m
// SIG // dCBDb3Jwb3JhdGlvbjENMAsGA1UECxMETU9QUjEeMBwG
// SIG // A1UEAxMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMIIBIjAN
// SIG // BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0IfUQit+
// SIG // ndnGetSiw+MVktJTnZUXyVI2+lS/qxCv6cnnzCZTw8Jz
// SIG // v23WAOUA3OlqZzQw9hYXtAGllXyLuaQs5os7efYjDHmP
// SIG // 81LfQAEcwsYDnetZz3Pp2HE5m/DOJVkt0slbCu9+1jIO
// SIG // XXQSBOyeBFOmawJn+E1Zi3fgKyHg78CkRRLPA3sDxjnD
// SIG // 1CLcVVx3Qv+csuVVZ2i6LXZqf2ZTR9VHCsw43o17lxl9
// SIG // gtAm+KWO5aHwXmQQ5PnrJ8by4AjQDfJnwNjyL/uJ2hX5
// SIG // rg8+AJcH0Qs+cNR3q3J4QZgHuBfMorFf7L3zUGej15Tw
// SIG // 0otVj1OmlZPmsmbPyTdo5GPHzwIDAQABo4IBgDCCAXww
// SIG // HwYDVR0lBBgwFgYKKwYBBAGCN0wIAQYIKwYBBQUHAwMw
// SIG // HQYDVR0OBBYEFKvI1u2yFdKqjvHM7Ww490VK0Iq7MFIG
// SIG // A1UdEQRLMEmkRzBFMQ0wCwYDVQQLEwRNT1BSMTQwMgYD
// SIG // VQQFEysyMzAwMTIrYjA1MGM2ZTctNzY0MS00NDFmLWJj
// SIG // NGEtNDM0ODFlNDE1ZDA4MB8GA1UdIwQYMBaAFEhuZOVQ
// SIG // BdOCqhc3NyK1bajKdQKVMFQGA1UdHwRNMEswSaBHoEWG
// SIG // Q2h0dHA6Ly93d3cubWljcm9zb2Z0LmNvbS9wa2lvcHMv
// SIG // Y3JsL01pY0NvZFNpZ1BDQTIwMTFfMjAxMS0wNy0wOC5j
// SIG // cmwwYQYIKwYBBQUHAQEEVTBTMFEGCCsGAQUFBzAChkVo
// SIG // dHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtpb3BzL2Nl
// SIG // cnRzL01pY0NvZFNpZ1BDQTIwMTFfMjAxMS0wNy0wOC5j
// SIG // cnQwDAYDVR0TAQH/BAIwADANBgkqhkiG9w0BAQsFAAOC
// SIG // AgEARIkCrGlT88S2u9SMYFPnymyoSWlmvqWaQZk62J3S
// SIG // VwJRavq/m5bbpiZ9CVbo3O0ldXqlR1KoHksWU/PuD5rD
// SIG // BJUpwYKEpFYx/KCKkZW1v1rOqQEfZEah5srx13R7v5II
// SIG // UV58MwJeUTub5dguXwJMCZwaQ9px7eTZ56LadCwXreUM
// SIG // tRj1VAnUvhxzzSB7pPrI29jbOq76kMWjvZVlrkYtVylY
// SIG // 1pLwbNpj8Y8zon44dl7d8zXtrJo7YoHQThl8SHywC484
// SIG // zC281TllqZXBA+KSybmr0lcKqtxSCy5WJ6PimJdXjryp
// SIG // WW4kko6C4glzgtk1g8yff9EEjoi44pqDWLDUmuYx+pRH
// SIG // jn2m4k5589jTajMWUHDxQruYCen/zJVVWwi/klKoCMTx
// SIG // 6PH/QNf5mjad/bqQhdJVPlCtRh/vJQy4njpIBGPveJii
// SIG // XQMNAtjcIKvmVrXe7xZmw9dVgh5PgnjJnlQaEGC3F6tA
// SIG // E5GusBnBmjOd7jJyzWXMT0aYLQ9RYB58+/7b6Ad5B/eh
// SIG // Mzj+CZrbj3u2Or2FhrjMvH0BMLd7HaldG73MTRf3bkcz
// SIG // 1UDfasouUbi1uc/DBNM75ePpEIzrp7repC4zaikvFErq
// SIG // HsEiODUFhe/CBAANa8HYlhRIFa9+UrC4YMRStUqCt4Uq
// SIG // AEkqJoMnWkHevdVmSbwLnHhwCbwwggd6MIIFYqADAgEC
// SIG // AgphDpDSAAAAAAADMA0GCSqGSIb3DQEBCwUAMIGIMQsw
// SIG // CQYDVQQGEwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQ
// SIG // MA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9z
// SIG // b2Z0IENvcnBvcmF0aW9uMTIwMAYDVQQDEylNaWNyb3Nv
// SIG // ZnQgUm9vdCBDZXJ0aWZpY2F0ZSBBdXRob3JpdHkgMjAx
// SIG // MTAeFw0xMTA3MDgyMDU5MDlaFw0yNjA3MDgyMTA5MDla
// SIG // MH4xCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5n
// SIG // dG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVN
// SIG // aWNyb3NvZnQgQ29ycG9yYXRpb24xKDAmBgNVBAMTH01p
// SIG // Y3Jvc29mdCBDb2RlIFNpZ25pbmcgUENBIDIwMTEwggIi
// SIG // MA0GCSqGSIb3DQEBAQUAA4ICDwAwggIKAoICAQCr8Ppy
// SIG // EBwurdhuqoIQTTS68rZYIZ9CGypr6VpQqrgGOBoESbp/
// SIG // wwwe3TdrxhLYC/A4wpkGsMg51QEUMULTiQ15ZId+lGAk
// SIG // bK+eSZzpaF7S35tTsgosw6/ZqSuuegmv15ZZymAaBelm
// SIG // dugyUiYSL+erCFDPs0S3XdjELgN1q2jzy23zOlyhFvRG
// SIG // uuA4ZKxuZDV4pqBjDy3TQJP4494HDdVceaVJKecNvqAT
// SIG // d76UPe/74ytaEB9NViiienLgEjq3SV7Y7e1DkYPZe7J7
// SIG // hhvZPrGMXeiJT4Qa8qEvWeSQOy2uM1jFtz7+MtOzAz2x
// SIG // sq+SOH7SnYAs9U5WkSE1JcM5bmR/U7qcD60ZI4TL9LoD
// SIG // ho33X/DQUr+MlIe8wCF0JV8YKLbMJyg4JZg5SjbPfLGS
// SIG // rhwjp6lm7GEfauEoSZ1fiOIlXdMhSz5SxLVXPyQD8NF6
// SIG // Wy/VI+NwXQ9RRnez+ADhvKwCgl/bwBWzvRvUVUvnOaEP
// SIG // 6SNJvBi4RHxF5MHDcnrgcuck379GmcXvwhxX24ON7E1J
// SIG // MKerjt/sW5+v/N2wZuLBl4F77dbtS+dJKacTKKanfWeA
// SIG // 5opieF+yL4TXV5xcv3coKPHtbcMojyyPQDdPweGFRInE
// SIG // CUzF1KVDL3SV9274eCBYLBNdYJWaPk8zhNqwiBfenk70
// SIG // lrC8RqBsmNLg1oiMCwIDAQABo4IB7TCCAekwEAYJKwYB
// SIG // BAGCNxUBBAMCAQAwHQYDVR0OBBYEFEhuZOVQBdOCqhc3
// SIG // NyK1bajKdQKVMBkGCSsGAQQBgjcUAgQMHgoAUwB1AGIA
// SIG // QwBBMAsGA1UdDwQEAwIBhjAPBgNVHRMBAf8EBTADAQH/
// SIG // MB8GA1UdIwQYMBaAFHItOgIxkEO5FAVO4eqnxzHRI4k0
// SIG // MFoGA1UdHwRTMFEwT6BNoEuGSWh0dHA6Ly9jcmwubWlj
// SIG // cm9zb2Z0LmNvbS9wa2kvY3JsL3Byb2R1Y3RzL01pY1Jv
// SIG // b0NlckF1dDIwMTFfMjAxMV8wM18yMi5jcmwwXgYIKwYB
// SIG // BQUHAQEEUjBQME4GCCsGAQUFBzAChkJodHRwOi8vd3d3
// SIG // Lm1pY3Jvc29mdC5jb20vcGtpL2NlcnRzL01pY1Jvb0Nl
// SIG // ckF1dDIwMTFfMjAxMV8wM18yMi5jcnQwgZ8GA1UdIASB
// SIG // lzCBlDCBkQYJKwYBBAGCNy4DMIGDMD8GCCsGAQUFBwIB
// SIG // FjNodHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtpb3Bz
// SIG // L2RvY3MvcHJpbWFyeWNwcy5odG0wQAYIKwYBBQUHAgIw
// SIG // NB4yIB0ATABlAGcAYQBsAF8AcABvAGwAaQBjAHkAXwBz
// SIG // AHQAYQB0AGUAbQBlAG4AdAAuIB0wDQYJKoZIhvcNAQEL
// SIG // BQADggIBAGfyhqWY4FR5Gi7T2HRnIpsLlhHhY5KZQpZ9
// SIG // 0nkMkMFlXy4sPvjDctFtg/6+P+gKyju/R6mj82nbY78i
// SIG // NaWXXWWEkH2LRlBV2AySfNIaSxzzPEKLUtCw/WvjPgcu
// SIG // KZvmPRul1LUdd5Q54ulkyUQ9eHoj8xN9ppB0g430yyYC
// SIG // RirCihC7pKkFDJvtaPpoLpWgKj8qa1hJYx8JaW5amJbk
// SIG // g/TAj/NGK978O9C9Ne9uJa7lryft0N3zDq+ZKJeYTQ49
// SIG // C/IIidYfwzIY4vDFLc5bnrRJOQrGCsLGra7lstnbFYhR
// SIG // RVg4MnEnGn+x9Cf43iw6IGmYslmJaG5vp7d0w0AFBqYB
// SIG // Kig+gj8TTWYLwLNN9eGPfxxvFX1Fp3blQCplo8NdUmKG
// SIG // wx1jNpeG39rz+PIWoZon4c2ll9DuXWNB41sHnIc+BncG
// SIG // 0QaxdR8UvmFhtfDcxhsEvt9Bxw4o7t5lL+yX9qFcltgA
// SIG // 1qFGvVnzl6UJS0gQmYAf0AApxbGbpT9Fdx41xtKiop96
// SIG // eiL6SJUfq/tHI4D1nvi/a7dLl+LrdXga7Oo3mXkYS//W
// SIG // syNodeav+vyL6wuA6mk7r/ww7QRMjt/fdW1jkT3RnVZO
// SIG // T7+AVyKheBEyIXrvQQqxP/uozKRdwaGIm1dxVk5IRcBC
// SIG // yZt2WwqASGv9eZ/BvW1taslScxMNelDNMYIEqjCCBKYC
// SIG // AQEwgZUwfjELMAkGA1UEBhMCVVMxEzARBgNVBAgTCldh
// SIG // c2hpbmd0b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNV
// SIG // BAoTFU1pY3Jvc29mdCBDb3Jwb3JhdGlvbjEoMCYGA1UE
// SIG // AxMfTWljcm9zb2Z0IENvZGUgU2lnbmluZyBQQ0EgMjAx
// SIG // MQITMwAAAI6HkaRXGl/KPgAAAAAAjjAJBgUrDgMCGgUA
// SIG // oIG+MBkGCSqGSIb3DQEJAzEMBgorBgEEAYI3AgEEMBwG
// SIG // CisGAQQBgjcCAQsxDjAMBgorBgEEAYI3AgEVMCMGCSqG
// SIG // SIb3DQEJBDEWBBSlqMUp714JBuVf7vVAo+r5KSQNszBe
// SIG // BgorBgEEAYI3AgEMMVAwTqAMgAoAQQBkAFMARABLoT6A
// SIG // PGh0dHA6Ly9lZHdlYi9zaXRlcy9JU1NFbmdpbmVlcmlu
// SIG // Zy9FbmdGdW4vU2l0ZVBhZ2VzL0hvbWUuYXNweDANBgkq
// SIG // hkiG9w0BAQEFAASCAQAIuWSEnOPwvacb56x0U1ZoQfAy
// SIG // 84/ZNVJmef9yhPS7ZtcV9mJS7J+8gC6ekRrtg5VJhbBw
// SIG // 6qZaaosNUuV0YWErvEgGXNjhmxCzQXgufg6HtnDuwP0e
// SIG // JZqD/9A432F5EWlrB7520cnxq18UX9/dOjrzs48RIFwN
// SIG // ifn4VZzfF8j8cWR4tioNLrPUImvR6BjluFtsrYmVRC0/
// SIG // /wVtU2xNI/XPHje+FOcI7eipcYNGY9i5zcAWONLSzjxA
// SIG // PNRhx5L2XCf/GvpnUaMNE73S39FvtqqRbHvpiIpeQs0Y
// SIG // KCpRLhCbZAlpWAASH/SVR6Dd3DxVbdocWDqkxFpeo80H
// SIG // daddxoOQoYICKDCCAiQGCSqGSIb3DQEJBjGCAhUwggIR
// SIG // AgEBMIGOMHcxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpX
// SIG // YXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4wHAYD
// SIG // VQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xITAfBgNV
// SIG // BAMTGE1pY3Jvc29mdCBUaW1lLVN0YW1wIFBDQQITMwAA
// SIG // AMhHIp2jDcrAWAAAAAAAyDAJBgUrDgMCGgUAoF0wGAYJ
// SIG // KoZIhvcNAQkDMQsGCSqGSIb3DQEHATAcBgkqhkiG9w0B
// SIG // CQUxDxcNMTcwNTE3MDY1MzE0WjAjBgkqhkiG9w0BCQQx
// SIG // FgQU1LV9u3B2QO0sxZyqVak5EHYWo80wDQYJKoZIhvcN
// SIG // AQEFBQAEggEAJ8oVmIB19A7VOi1Ih5/CEJS3kd6D7KKp
// SIG // 0tafRQyRhpWRnqo8D/z64zZLnabVkcQLIpfhww4ZWc4I
// SIG // YCM5INouZ8ubZQDZMNvYBmwUVDmTu4HwtJFRoVTEtCdo
// SIG // /KvfPVrhiyrATvzRAXpo8LEeHmWD6/thzvcXjiCpAfDm
// SIG // gIzWQ4Kypf9HQI1lO6eE1Mg3DtKdaBbM5r9SvoFxVKLA
// SIG // lBmlLsq74gN5lgD1gwUBV/i7ShQl0On/40HRRhaxAHOV
// SIG // 22HlClucaPOaoRgF0ti+QOVOm5nVRk+Me7pARd9s0Lh5
// SIG // vaJkprudarpj5VK2yljvJW8YFcekmqoUKSVuHkNYZacbwA==
// SIG // End signature block
