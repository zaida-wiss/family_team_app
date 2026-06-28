import "./ChildBanknotesModal.css";
import { ArrowLeft, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";

const SEDLAR = [1000, 500, 200, 100, 50, 20];
const MYNT = [10, 5, 2, 1];

type MoneyPiece = { value: number; count: number };

function breakdown(kr: number): { sedlar: MoneyPiece[]; mynt: MoneyPiece[] } {
  const sedlar: MoneyPiece[] = [];
  const mynt: MoneyPiece[] = [];
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

function BankCatalog() {
  return (
    <div className="bm-content">
      <p className="bm-bank-intro">Giltiga svenska sedlar och mynt</p>

      <div className="bm-bank-section bm-bank-coins-section">
        {[...MYNT].reverse().map((value) => (
          <div key={value} className="bm-bank-coin">
            <span className="bm-bank-label">{value} kr</span>
            <img
              src={`/pengar/mynt-${value}.webp`}
              alt={`${value}-krona fram och bak`}
              className="bm-bank-img bm-bank-coin-img"
              data-coin={value}
              loading="lazy"
              decoding="async"
            />
          </div>
        ))}
      </div>

      <div className="bm-bank-section">
        {[...SEDLAR].reverse().map((value) => (
          <div key={value} className="bm-bank-note">
            <span className="bm-bank-label">{value} kr</span>
            <div className="bm-bank-sides">
              <img
                src={`/pengar/sedel-${value}.webp`}
                alt={`${value}-kronorssedel framsida`}
                className="bm-bank-img bm-bank-note-img"
                data-note={value}
                loading="lazy"
                decoding="async"
              />
              <img
                src={`/pengar/sedel-${value}-bak.webp`}
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
    </div>
  );
}

function BankBreakdown({
  sedlar,
  mynt,
  isEmpty,
  onOpenBank,
}: {
  sedlar: MoneyPiece[];
  mynt: MoneyPiece[];
  isEmpty: boolean;
  onOpenBank: () => void;
}) {
  return (
    <>
      {isEmpty ? (
        <p className="bm-empty">Tjäna fler stjärnor — varje stjärna är 1 kr! ⭐</p>
      ) : (
        <div className="bm-content">
          {sedlar.length > 0 && (
            <div className="bm-section">
              {sedlar.map(({ value, count }) => (
                <div key={value} className="bm-note-row">
                  <div className="bm-money-stack">
                    {Array.from({ length: count }).map((_, i) => (
                      <div key={i} className="bm-note-wrap">
                        <img
                          src={`/pengar/sedel-${value}.webp`}
                          alt={`${value}-kronorssedel`}
                          className="bm-note-img"
                          data-note={value}
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    ))}
                  </div>
                  <span className="bm-note-label">
                    {value} kr{count > 1 ? ` × ${count}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {mynt.length > 0 && (
            <div className="bm-section bm-coins-section">
              {mynt.map(({ value, count }) => (
                <div key={value} className="bm-coin-row">
                  <div className="bm-money-stack bm-coin-stack">
                    {Array.from({ length: count }).map((_, i) => (
                      <div key={i} className="bm-coin-wrap">
                        <div className="bm-coin-clip" data-coin={value}>
                          <img
                            src={`/pengar/mynt-${value}.webp`}
                            alt={`${value}-krona`}
                            className="bm-coin-img"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <span className="bm-note-label">
                    {value} kr{count > 1 ? ` × ${count}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <button className="bm-bank-btn" type="button" onClick={onOpenBank}>
        🏦 Banken
      </button>
    </>
  );
}

type Props = {
  totalKronor: number;
  onClose: () => void;
};

export function ChildBanknotesModal({ totalKronor, onClose }: Props) {
  const [showBank, setShowBank] = useState(false);
  const { sedlar, mynt } = breakdown(totalKronor);

  return createPortal(
    <div className="bm-overlay" onClick={onClose}>
      <div className="bm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="bm-handle" />

        <div className="bm-header">
          <div className="bm-header-left">
            {showBank && (
              <button className="bm-back" type="button" aria-label="Tillbaka" onClick={() => setShowBank(false)}>
                <ArrowLeft size={20} />
              </button>
            )}
            <div>
              <h3 className="bm-title">{showBank ? "Banken" : "Dina stjärnor i pengar"}</h3>
              {!showBank && <p className="bm-amount">{totalKronor} kr</p>}
            </div>
          </div>
          <button className="bm-close" onClick={onClose} type="button" aria-label="Stäng">
            <X size={22} />
          </button>
        </div>

        <p className="bm-credit">Bilder: Sveriges Riksbank</p>

        {showBank
          ? <BankCatalog />
          : <BankBreakdown sedlar={sedlar} mynt={mynt} isEmpty={sedlar.length === 0 && mynt.length === 0} onOpenBank={() => setShowBank(true)} />
        }
      </div>
    </div>,
    document.body
  );
}
