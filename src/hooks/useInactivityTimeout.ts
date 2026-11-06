/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext.tsx';

interface InactivityConfig {
  timeoutMinutes?: number;
  warningSeconds?: number;
}

export function useInactivityTimeout(config: InactivityConfig = {}) {
  const { user, logout } = useAuth();
  const timeoutMinutes = config.timeoutMinutes || 30;
  const warningSeconds = config.warningSeconds || 60;

  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(warningSeconds);

  const lastActivityRef = useRef<number>(Date.now());
  const timerRef = useRef<any>(null);
  const countdownIntervalRef = useRef<any>(null);

  const resetActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarning) {
      setShowWarning(false);
      setSecondsRemaining(warningSeconds);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    }
  }, [showWarning, warningSeconds]);

  const handleKeepAlive = () => {
    resetActivity();
  };

  const handlePerformLogout = useCallback(async () => {
    setShowWarning(false);
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    if (timerRef.current) clearTimeout(timerRef.current);
    await logout();
  }, [logout]);

  useEffect(() => {
    if (!user) {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'];
    const handleUserEvent = () => {
      // Only throttle updates if warning is not active
      if (!showWarning) {
        lastActivityRef.current = Date.now();
      }
    };

    events.forEach((evt) => window.addEventListener(evt, handleUserEvent, { passive: true }));

    // Check interval every 5 seconds
    const interval = setInterval(() => {
      const idleTimeMs = Date.now() - lastActivityRef.current;
      const timeoutMs = timeoutMinutes * 60 * 1000;
      const warningThresholdMs = timeoutMs - warningSeconds * 1000;

      if (idleTimeMs >= timeoutMs) {
        // Time is up!
        clearInterval(interval);
        handlePerformLogout();
      } else if (idleTimeMs >= warningThresholdMs && !showWarning) {
        setShowWarning(true);
        const rem = Math.max(1, Math.ceil((timeoutMs - idleTimeMs) / 1000));
        setSecondsRemaining(rem);

        countdownIntervalRef.current = setInterval(() => {
          setSecondsRemaining((prev) => {
            if (prev <= 1) {
              clearInterval(countdownIntervalRef.current);
              handlePerformLogout();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    }, 5000);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleUserEvent));
      clearInterval(interval);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [user, timeoutMinutes, warningSeconds, showWarning, handlePerformLogout]);

  return {
    showWarning,
    secondsRemaining,
    handleKeepAlive,
    handlePerformLogout
  };
}
