(function(google) {
    const video = document.querySelector('#video');
    const adContainer = document.querySelector('#ad-container');
    const logContainer = document.querySelector('#log');
    const width = 640;
    const height = 360;
    const contentUrl = '//content.jwplatform.com/videos/ayG707fn-KThtkKLX.mp4';
    const adTagUrl = 'https://playertest.longtailvideo.com/ima-30s-skippable.xml';

    video.src = contentUrl;
    video.muted = true;

    adContainer.addEventListener('click', startPlayback);
    adContainer.addEventListener('touchend', startPlayback);

    const adDisplayContainer = new google.ima.AdDisplayContainer(adContainer, video);
    const adsLoader = new google.ima.AdsLoader(adDisplayContainer);

    let resolveAdsManager;
    const adsManagerPromise = new Promise(function(resolve) {
        resolveAdsManager = resolve;
    });

    let adsManagerForLoaderError;
    adsManagerPromise.then(function(adsManager) {
        adsManagerForLoaderError = adsManager;
        if (destroyed) {
            return;
        }
        log('[Application] adsManager.start()');
        adsManager.start();
    });

    let customAdTimeout = -1;
    let initialized = false;
    let destroyed = false;
    function startPlayback(e) {
        log('[Application] "' + e.type + '"');

        if (initialized) {
            if (video.paused) {
                log('[Application] video.play()');
                video.play();
            } else {
                log('[Application] video.pause()');
                video.pause();
            }
            return;
        }
        initialized = true;

        google.ima.settings.setDisableCustomPlaybackForIOS10Plus(true);
        google.ima.settings.setLocale('en');
        google.ima.settings.setNumRedirects(5);

        adsLoader.addEventListener(google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, adsManagerLoaded, false);

        video.load();
        video.pause();

        log('[Application] adDisplayContainer.initialize()');
        adDisplayContainer.initialize();

        const adsRequest = new google.ima.AdsRequest();
        const userRequestContext = {
            requestType: 'TYPE_API',
            vpaidMode: 'insecure',
            playerVersion: '8.12.0',
            adPosition: '',
            adTagUrl: adTagUrl
        };

        adsRequest.setAdWillAutoPlay(true);
        adsRequest.setAdWillPlayMuted(true);
        adsRequest.linearAdSlotWidth = width;
        adsRequest.linearAdSlotHeight = height;
        adsRequest.vastLoadTimeout = 10000;
        adsRequest.adTagUrl = userRequestContext.adTagUrl;

        const settings = adsLoader.getSettings();
        settings.setPlayerVersion(userRequestContext.playerVersion);
        settings.setVpaidMode(userRequestContext.vpaidMode);

        log('[Application] start custom ad timeout timer');
        clearTimeout(customAdTimeout);
        customAdTimeout = setTimeout(() => {
            log('[Application] custom ad request timeout fired');

            destroyAdSession(adsManagerForLoaderError, adsLoader);

            adsManagerPromise.then(function(adsManager) {
                discardAdBreak(adsManager, adsLoader);
            });

        }, 5000);

        log('[Application] adsLoader.requestAds(...)');
        adsLoader.requestAds(adsRequest, userRequestContext);
    }

    function destroyAdSession(imaAdsManager, imaAdsLoader) {
        log('[Application] destroy ad session');
        clearTimeout(customAdTimeout);
        if (destroyed) {
            return;
        }
        destroyed = true;
        if (imaAdsManager) {
            log('[Application] adsManager.destroy()');
            imaAdsManager.destroy();
        }
        log('[Application] adsLoader.contentComplete()');
        imaAdsLoader.contentComplete();
        log('[Application] resume content playback');
        video.src = contentUrl;
        video.load();
        video.play();
    }

    function discardAdBreak(imaAdsManager, imaAdsLoader) {
        if (imaAdsManager.getCuePoints().length === 0) {
            imaAdsManager.destroy();
            imaAdsLoader.contentComplete();
        } else {
            imaAdsManager.discardAdBreak();
            imaAdsManager.stop();
        }
    }

    function adsManagerLoaded (event) {
        logIMAEvent(event);

        if (destroyed) {
            return;
        }

        const adsRenderingSettings = new google.ima.AdsRenderingSettings();
        adsRenderingSettings.enablePreloading = true;
        adsRenderingSettings.loadVideoTimeout = 6000;
        adsRenderingSettings.uiElements = null;
        adsRenderingSettings.useStyledNonLinearAds = true;
        adsRenderingSettings.bitrate = 500000;

        const playbackProxy = {
            currentTime: 0,
            duration: 0
        };
        const adsManager = event.getAdsManager(playbackProxy, adsRenderingSettings);

        adsManager.addEventListener(google.ima.AdEvent.Type.LOADED, logIMAEvent);
        adsManager.addEventListener(google.ima.AdEvent.Type.CONTENT_PAUSE_REQUESTED, logIMAEvent);
        adsManager.addEventListener(google.ima.AdEvent.Type.CONTENT_RESUME_REQUESTED, resumeRequested);
        adsManager.addEventListener(google.ima.AdEvent.Type.STARTED, logIMAEvent);
        adsManager.addEventListener(google.ima.AdEvent.Type.IMPRESSION, adImpression);
        adsManager.addEventListener(google.ima.AdEvent.Type.LINEAR_CHANGED, logIMAEvent);
        adsManager.addEventListener(google.ima.AdEvent.Type.CLICK, logIMAEvent);
        adsManager.addEventListener(google.ima.AdEvent.Type.PAUSED, logIMAEvent);
        adsManager.addEventListener(google.ima.AdEvent.Type.RESUMED, logIMAEvent);
        adsManager.addEventListener(google.ima.AdEvent.Type.SKIPPED, logIMAEvent);
        adsManager.addEventListener(google.ima.AdEvent.Type.USER_CLOSE, logIMAEvent);
        adsManager.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED, logIMAEvent);
        adsManager.addEventListener(google.ima.AdEvent.Type.LOG, adLog);
        adsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, adsManagerErrorHandler);

        log('[Application] adsManager.init(' + width + ', ' + height + ', ' + google.ima.ViewMode.NORMAL + ')');
        adsManager.init(width, height, google.ima.ViewMode.NORMAL);

        resolveAdsManager(adsManager);

        const stopButton = document.querySelector('#stop');
        stopButton.addEventListener('click', function() {
            adsManager.discardAdBreak();
            adsManager.stop();
        });

        const skipButton = document.querySelector('#skip');
        skipButton.addEventListener('click', function() {
            adsManager.skip();
        });

        const seekButton = document.querySelector('#seek');
        seekButton.addEventListener('click', function() {
            document.querySelector('video').currentTime = 15;
        });

        function adImpression(adsManagerEvent) {
            clearTimeout(customAdTimeout);
            logIMAEvent(adsManagerEvent);
        }

        function adLog(adsManagerEvent) {
            logIMAEvent(adsManagerEvent);

            const adData = (adsManagerEvent && (typeof adsManagerEvent.getAdData === 'function')) ?
                adsManagerEvent.getAdData() : null;
            const adError = adData && adData.adError;
            if (adError) {
                log('[IMA] AdsManager LOG event error: ' + adError.getErrorCode());
            }
            if (adError && adError.getVastErrorCode() === 402) {
                destroyAdSession(adsManager, adsLoader);
            }
        }

        function adsManagerErrorHandler(error) {
            clearTimeout(customAdTimeout);
            const adError = error.getError();
            log('[IMA] AdsManager AdError ' + adError.getErrorCode());
            if (adError.getErrorCode() === 900) {
                setTimeout(() => {
                    destroyAdSession(adsManager, adsLoader);
                }, 0);
            } else {
                destroyAdSession(adsManager, adsLoader);
            }
        }
    }

    function resumeRequested(event) {
        clearTimeout(customAdTimeout);
        logIMAEvent(event);
        if (destroyed) {
            return;
        }
        video.src = contentUrl;
        video.load();
        video.play();
    }

    function logIMAEvent(event) {
        console.warn(event.target + ' >> "' + event.type + '"', event);
        const pre = document.createElement('pre');
        pre.textContent = '[IMA] ' + event.target.constructor.name + ' >> "' + event.type + '"';
        logContainer.appendChild(pre);
    }

    function log(message) {
        const pre = document.createElement('pre');
        pre.textContent = message;
        logContainer.appendChild(pre);
    }

}(window.google));

// Log video events
(function() {
    const video = document.querySelector('#video');
    const logContainer = document.querySelector('#log');

    function toString(el) {
        return ((el.parentNode ? ('<' + el.parentNode.nodeName + '>') : '') + '<' + el.nodeName + '>')
            .toLowerCase();
    }

    function videoEventHandler(e) {
        console.warn(toString(e.target) + ' >> "' + e.type + '"', e);
        const pre = document.createElement('pre');
        pre.textContent = toString(e.target) + ' >> "' + e.type + '"';
        logContainer.appendChild(pre);
    }

    const load = video.load;
    const pause = video.pause;
    const play = video.play;
    video.load = function() {
        console.error(toString(video) + '.load()', video.src);
        return load.call(this);
    };
    video.pause = function() {
        console.error(toString(video) + '.pause()');
        return pause.call(this);
    };
    video.play = function() {
        console.error(toString(video) + '.play()');
        return play.call(this);
    };
    [
        'loadstart',
        'abort',
        'error',
        'emptied',
        'canplaythrough',
        'playing',
        'waiting',
        'ended',
        'durationchange',
        'play',
        'pause',
        'resize',
    ].forEach((eventName) => {
        video.addEventListener(eventName, videoEventHandler);
    });
}());
