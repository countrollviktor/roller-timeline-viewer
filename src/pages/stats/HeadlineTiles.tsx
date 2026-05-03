import type { Headline } from '../../api/stats';

interface TileProps {
  label: string;
  today: number;
  subtext: string;
}

function Tile({ label, today, subtext }: TileProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-3xl font-bold text-gray-900 mt-1">{today.toLocaleString()}</div>
      <div className="text-xs text-gray-400 mt-1">{subtext}</div>
    </div>
  );
}

export function HeadlineTiles({ data }: { data: Headline }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Tile
        label="Sessions today"
        today={data.sessionsToday}
        subtext={`avg ${data.sessionsAvg.toLocaleString()}/day (30d)`}
      />
      <Tile
        label="Asset lookups today"
        today={data.lookupsToday}
        subtext={`avg ${data.lookupsAvg.toLocaleString()}/day (30d)`}
      />
      <Tile
        label="Active users today"
        today={data.activeToday}
        subtext={`avg ${data.activeAvg.toLocaleString()}/day (30d)`}
      />
      <Tile
        label="Distinct assets today"
        today={data.distinctAssetsToday}
        subtext={`${data.distinctAssets30d.toLocaleString()} unique (30d)`}
      />
    </div>
  );
}
