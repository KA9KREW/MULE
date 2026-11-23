import type { BuildingKind, FieldSiteUi, KeepTrainKind, TrainKind } from "../game/types";

interface FieldSitePanelProps {
  site: FieldSiteUi;
  onBuild: (kind: BuildingKind, padId: string) => void;
  onTrain: (kind: TrainKind, buildingId: number) => void;
  onKeepTrain: (kind: KeepTrainKind) => void;
  onTemplar: (buildingId: number) => void;
  onChurch: (buildingId: number) => void;
  onMarket: (buildingId: number) => void;
  onTrade: (resource: "wood" | "gold", side: "buy" | "sell") => void;
  onRally: (on: boolean, target: { buildingId?: number; keep?: boolean }) => void;
}

export function FieldSitePanel({
  site,
  onBuild,
  onTrain,
  onKeepTrain,
  onTemplar,
  onChurch,
  onMarket,
  onTrade,
  onRally,
}: FieldSitePanelProps) {
  if (site.kind === "market") {
    const rows: { label: string; price: string; enabled: boolean; resource: "wood" | "gold"; side: "buy" | "sell" }[] = [
      { label: "Buy wood", price: `${site.woodBuy}g`, enabled: site.canBuyWood, resource: "wood", side: "buy" },
      { label: "Sell wood", price: `${site.woodSell}g`, enabled: site.canSellWood, resource: "wood", side: "sell" },
      { label: "Buy gold", price: `${site.goldBuy}w`, enabled: site.canBuyGold, resource: "gold", side: "buy" },
      { label: "Sell gold", price: `${site.goldSell}w`, enabled: site.canSellGold, resource: "gold", side: "sell" },
    ];
    return (
      <div className="sheet-float field-site" role="region" aria-label="Market">
        <div className="detail-title">Market</div>
        <div className="field-choices">
          {rows.map((row) => (
            <button
              key={row.label}
              type="button"
              className={`train-opt${row.enabled ? " afford" : ""}`}
              disabled={!row.enabled}
              onClick={() => onTrade(row.resource, row.side)}
            >
              <strong>{row.label}</strong>
              <em>{row.price}</em>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (site.kind === "chapel") {
    return (
      <div className="sheet-float field-site" role="region" aria-label="Church pad">
        <div className="detail-title">Church pad</div>
        <div className="field-choices">
          {site.choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={`train-opt${choice.enabled ? " afford" : ""}`}
              disabled={!choice.enabled}
              onClick={() => (choice.id === "market" ? onMarket(site.buildingId) : onChurch(site.buildingId))}
            >
              <strong>{choice.label}</strong>
              <em>{choice.price}</em>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (site.kind === "build") {
    return (
      <div className="sheet-float field-site" role="region" aria-label="Build">
        <div className="detail-title">{site.title}</div>
        <div className="field-choices">
          {site.choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={`train-opt${choice.enabled ? " afford" : ""}`}
              disabled={!choice.enabled}
              onClick={() => onBuild(choice.id as BuildingKind, site.padId)}
            >
              <strong>{choice.label}</strong>
              <em>{choice.price}</em>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-float field-site" role="region" aria-label={site.title}>
      <div className="detail-title">{site.title}</div>
      {site.freeLines.length > 0 && (
        <div className="field-free">
          {site.freeLines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}
      {site.choices.length > 0 && (
        <div className="field-choices">
          {site.choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={`train-opt${choice.enabled ? " afford" : ""}`}
              disabled={!choice.enabled}
              onClick={() => {
                if (site.keep) onKeepTrain(choice.id as KeepTrainKind);
                else if (choice.id === "templar") onTemplar(site.buildingId);
                else onTrain(choice.id as TrainKind, site.buildingId);
              }}
            >
              <strong>{choice.label}</strong>
              <em>{choice.price}</em>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        className={`field-rally${site.rally ? " on" : ""}`}
        aria-pressed={site.rally}
        onClick={() => onRally(!site.rally, site.keep ? { keep: true } : { buildingId: site.buildingId })}
      >
        Rally to player
      </button>
      <p className="field-buff">
        Rallied units gain +20% attack and defence, with extra defence versus towers and archers.
      </p>
    </div>
  );
}
