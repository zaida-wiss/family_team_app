// Ljud när en nedräkning når 00:00 (2026-08-10, Zaidas önskemål: "är det
// möjligt att få ett ljud uppspelat när en timer tickat ner till 00.00?").
// Syntetiserad via Web Audio API — inget ljudfil-beroende, ingen ny
// dependency (CLAUDE.md-regeln om motiverade beroenden). Delas av barnens
// uppdragskort (ChildTasksSection.tsx) och vuxenvyns/familjevyns
// timer-sektion i uppgiftsmodalen (TodoDetailView.tsx) — de enda två
// ställena med en riktig, kontinuerligt tickande nedräknings-widget (till
// skillnad från tråd-vyernas bubbel-etikett, som bara är en statisk text).

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) {
    try {
      audioCtx = new Ctor();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

// Mobila webbläsares autoplay-policy blockerar ljud som inte startas
// synkront inom en riktig användargest — anropas därför "tyst" (utan att
// spela något) från en global engångslyssnare på första tryck/klick i hela
// appen (se Shell.tsx), så AudioContext:en redan är upplåst när en
// nedräkning senare når noll av sig själv (ingen ny gest då).
export function primeTimerAudio(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {
      // ignorerat — nästa gest får försöka igen
    });
  }
}

// En kort, vänlig tvåtons-signal (inte en hård larmsignal) — hörbar men inte
// skrämmande för ett barn som precis avslutat en nedräkning.
export function playTimerDoneSound(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {
      // ignorerat
    });
  }
  const startTime = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const start = startTime + i * 0.18;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.4);
  });
}
