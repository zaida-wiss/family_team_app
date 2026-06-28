import "./ChildBanknotesModal.css";
import { ArrowLeft, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

const SEDLAR = [1000, 500, 200, 100, 50, 20];
const MYNT   = [10, 5, 2, 1];

function breakdown(kr: number) {
  const sedlar: { value: number; count: number }[] = [];
  const mynt:   { value: number; count: number }[] = [];
  let rem = Math.floor(kr);
  for (const v of SEDLAR) {
    const n = Math.floor(rem / v);
    if (n > 0) { sedlar.push({ value: v, count: n }); rem -= n * v; }
  }
  for (const v of MYNT) {
    const n = Math.floor(rem / v);
    if (n > 0) { mynt.push({ value: v, count: n }); rem -= n * v; }
  }
  return { sedlar, mynt };
}

type Props = { totalKronor: number; onClose: () => void };

export function ChildBanknotesModal({ totalKronor, onClose }: Props) {
  const [showBank, setShowBank] = useState(false);
  const { sedlar, mynt } = breakdown(totalKronor);
  const isEmpty = sedlar.length === 0 && mynt.length === 0;

  return createPortal(
    <div className="bm-overlay" onClick={onClose}>
      <div className="bm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="bm-handle" />

        <div className="bm-header">
          <div className="bm-header-left">
            {showBank && (
              <button
                className="bm-back"
                type="button"
                aria-label="Tillbaka"
                onClick={() => setShowBank(false)}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <div>
              <h3 className="bm-title">
                {showBank ? "Banken" : "Dina stjärnor i pengar"}
              </h3>
              {!showBank && <p className="bm-amount">{totalKronor} kr</p>}
            </div>
          </div>
          <button className="bm-close" onClick={onClose} type="button" aria-label="Stäng">
            <X size={22} />
          </button>
        </div>

        <p className="bm-credit">Bilder: Sveriges Riksbank</p>

        {showBank ? (
          <div className="bm-content">
            <p className="bm-bank-intro">Giltiga svenska sedlar och mynt</p>

            <div className="bm-bank-section">
              {SEDLAR.map((value) => (
                <div key={value} className="bm-bank-note">
                  <span className="bm-bank-label">{value} kr</span>
                  <div className="bm-bank-sides">
                    <img
                      src={`/pengar/sedel-${value}.png`}
                      alt={`${value}-kronorssedel framsida`}
                      className="bm-bank-img bm-bank-note-img"
                      data-note={value}
                      loading="lazy"
                      decoding="async"
                    />
                    <img
                      src={`/pengar/sedel-${value}-bak.png`}
                      alt={`${value}-kronorssedel baksida`}
                      className="bm-bank-img bm-bank-note-img"
                      data-note={value}
                      loading="lazy"
                      decoding="async"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="bm-bank-section bm-bank-coins-section">
              {MYNT.map((value) => (
                <div key={value} className="bm-bank-coin">
                  <span className="bm-bank-label">{value} kr</span>
                  <img
                    src={`/pengar/mynt-${value}.png`}
                    alt={`${value}-krona fram och bak`}
                    className="bm-bank-img bm-bank-coin-img"
                    data-coin={value}
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {isEmpty ? (
              <p className="bm-empty">Tjäna fler stjärnor — varje stjärna är 1 kr! ⭐</p>
            ) : (
              <div className="bm-content">
                {sedlar.length > 0 && (
                  <div className="bm-section">
                    {sedlar.map(({ value, count }) => (
                      <div key={value} className="bm-note-row">
                        <div className="bm-note-wrap">
                          <img
                            src={`/pengar/sedel-${value}.png`}
                            alt={`${value}-kronorssedel`}
                            className="bm-note-img"
                            data-note={value}
                            loading="lazy"
                            decoding="async"
                          />
                          {count > 1 && <span className="bm-count">×{count}</span>}
                        </div>
                        <span className="bm-note-label">{value} kr{count > 1 ? ` × ${count}` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}

                {mynt.length > 0 && (
                  <div className="bm-section bm-coins-section">
                    {mynt.map(({ value, count }) => (
                      <div key={value} className="bm-coin-row">
                        <div className="bm-coin-wrap">
                          <div className="bm-coin-clip" data-coin={value}>
                            <img
                              src={`/pengar/mynt-${value}.png`}
                              alt={`${value}-krona`}
                              className="bm-coin-img"
                              loading="lazy"
                              decoding="async"
                            />
                          </div>
                          {count > 1 && <span className="bm-count">×{count}</span>}
                        </div>
                        <span className="bm-note-label">{value} kr{count > 1 ? ` × ${count}` : ""}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              className="bm-bank-btn"
              type="button"
              onClick={() => setShowBank(true)}
            >
              🏦 Banken
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
