import { useEffect, useRef } from "react";
import { playTimerDoneSound } from "../utils/timerSound";

// Spelar ett kort ljud EN gång när en aktivt körande nedräkning passerar
// 00:00 (2026-08-10, Zaidas önskemål). "Armed"-mönster: så länge det finns
// tid kvar räknas larmet som oavfyrat; går tiden ner till 0 medan den är
// armerad avfyras det en gång och avväpnas — en fortsatt nedräkning som
// redan visar 0:00 (barnet håller inte in för att avsluta direkt) tjuter
// alltså inte om och om igen varje sekund. Nollställs (armeras på nytt) så
// fort tiden ökar igen (en riktig omstart av timern).
//
// Spelar MEDVETET inte vid första mount om nedräkningen redan var vid/under
// 0 då (t.ex. en gammal, redan övertidad timer man råkar öppna) — bara en
// LIVE övergång från positiv tid till 0 som sker medan komponenten är
// monterad räknas, annars hade bara det att öppna vyn kunnat ge ett
// överraskande pip.
export function useCountdownSound(isCountdown: boolean, isRunning: boolean, remainingMs: number): void {
  const armedRef = useRef(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!isCountdown) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      armedRef.current = remainingMs > 0;
      return;
    }
    if (!isRunning) return;
    if (remainingMs > 0) {
      armedRef.current = true;
      return;
    }
    if (armedRef.current) {
      armedRef.current = false;
      playTimerDoneSound();
    }
  }, [isCountdown, isRunning, remainingMs]);
}
