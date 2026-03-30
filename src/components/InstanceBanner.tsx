import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { apiJson } from '../auth/api';
import { isBackendEnabled } from '../utils/storage';
import { pickContrastingTextColor } from '../utils/bannerTextColor';

type InstanceBannerDto = {
  backgroundColor: string;
  message: string;
};

export function InstanceBanner() {
  const { user } = useAuth();
  const [dto, setDto] = useState<InstanceBannerDto | null>(null);

  useEffect(() => {
    if (!isBackendEnabled() || !user) {
      setDto(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiJson<InstanceBannerDto>('/api/instance-banner');
        if (!cancelled) setDto(res);
      } catch (e) {
        console.error('[banner] failed to load instance banner', e);
        if (!cancelled) setDto(null);
      }
    };
    void load();
    const onUpdated = () => {
      void load();
    };
    window.addEventListener('keel-instance-banner-updated', onUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('keel-instance-banner-updated', onUpdated);
    };
  }, [user]);

  const message = dto?.message?.trim() ?? '';
  if (!message) return null;

  const bg = dto?.backgroundColor?.trim() || '#1e40af';
  const color = pickContrastingTextColor(bg);

  return (
    <div
      role="status"
      className="w-full shrink-0 px-4 py-2.5 text-center text-sm font-medium shadow-sm"
      style={{ backgroundColor: bg, color }}
    >
      {message}
    </div>
  );
}
