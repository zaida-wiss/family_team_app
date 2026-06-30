import { MYNT, SEDLAR } from "./bankDenoms";

export function BankCatalog() {
  return (
    <div className="bm-content">
      <p className="bm-bank-intro">Giltiga svenska sedlar och mynt</p>

      <div className="bm-bank-section bm-bank-coins-section">
        {[...MYNT].reverse().map((value) => (
          <div key={value} className="bm-bank-coin">
            <span className="bm-bank-label">{value} kr</span>
            <img src={`/pengar/mynt-${value}.webp`} alt={`${value}-krona fram och bak`}
              className="bm-bank-img bm-bank-coin-img" data-coin={value}
              loading="lazy" decoding="async"
            />
          </div>
        ))}
      </div>

      <div className="bm-bank-section">
        {[...SEDLAR].reverse().map((value) => (
          <div key={value} className="bm-bank-note">
            <span className="bm-bank-label">{value} kr</span>
            <div className="bm-bank-sides">
              <img src={`/pengar/sedel-${value}.webp`} alt={`${value}-kronorssedel framsida`}
                className="bm-bank-img bm-bank-note-img" data-note={value}
                loading="lazy" decoding="async"
              />
              <img src={`/pengar/sedel-${value}-bak.webp`} alt={`${value}-kronorssedel baksida`}
                className="bm-bank-img bm-bank-note-img" data-note={value}
                loading="lazy" decoding="async"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
