import { EVENT_TYPE_CONFIG, MAIN_EVENT_TYPES } from './Timeline';

export function Legend() {
  return (
    <div className="flex flex-wrap gap-4">
      {MAIN_EVENT_TYPES.map(type => {
        const config = EVENT_TYPE_CONFIG[type];
        return (
          <div key={type} className="flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-sm"
              style={{
                backgroundColor: config.bgColor,
                borderColor: config.color,
                color: config.color,
              }}
            >
              {config.icon}
            </span>
            <span className="text-sm text-gray-600">{config.label}</span>
          </div>
        );
      })}
    </div>
  );
}
