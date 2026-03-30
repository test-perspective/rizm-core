import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Archive, Download, Database, Megaphone, Upload } from 'lucide-react';
import { Box, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { apiJson } from '../../auth/api';
import { ExportAllProjectsDialog } from './ExportAllProjectsDialog';
import { ExportDatabaseDialog } from './ExportDatabaseDialog';
import { ImportWizard } from '../../components/import/ImportWizard';
import { fetchProjectState } from '../../api/projects';
import { isBackendEnabled } from '../../utils/storage';
import { getAppVersion } from '../../utils/appVersion';
import { formatBytes } from '../../utils/formatBytes';
import { shortenPath } from '../../utils/shortenPath';
import { BannerSettingsDialog } from './BannerSettingsDialog';
import { DbSnapshotsDialog } from './DbSnapshotsDialog';

type AdminSectionProps = {
  user: { role: string };
};

type SystemInfo = {
  sqliteDbPath: string;
  sqliteDbFileSizeBytes: number;
  attachments: {
    totalSizeBytes: number;
    perProject: {
      projectId: string;
      projectName: string;
      attachmentCount: number;
      totalSizeBytes: number;
    }[];
  };
  fastembedCache: { path: string; sizeBytes: number };
};

const systemInfoTableSx = {
  border: '1px solid rgb(39 39 42)',
  borderRadius: 2,
  backgroundColor: 'rgb(24 24 27)',
} as const;

const systemInfoHeadCellSx = {
  color: 'rgb(161 161 170)',
  fontWeight: 600,
  borderBottom: '1px solid rgb(39 39 42)',
  py: 1.25,
} as const;

const systemInfoItemCellSx = {
  color: 'rgb(161 161 170)',
  verticalAlign: 'top',
  borderBottom: '1px solid rgb(39 39 42)',
  width: '38%',
  py: 1.25,
} as const;

const systemInfoContentCellSx = {
  color: 'rgb(228 228 231)',
  verticalAlign: 'top',
  borderBottom: '1px solid rgb(39 39 42)',
  py: 1.25,
  fontFamily: 'ui-monospace, monospace',
  fontSize: '0.8125rem',
  wordBreak: 'break-all' as const,
};

function SystemInfoTable({
  appVersion,
  systemInfo,
}: {
  appVersion: string;
  systemInfo: SystemInfo | null;
}) {
  const rows = useMemo(() => {
    const out: { key: string; item: string; content: ReactNode }[] = [
      { key: 'version', item: 'Version', content: appVersion },
    ];
    if (!systemInfo) {
      return out;
    }
    out.push(
      {
        key: 'db-path',
        item: 'SQLite DB path',
        content: shortenPath(systemInfo.sqliteDbPath),
      },
      {
        key: 'db-size',
        item: 'SQLite DB size',
        content: formatBytes(systemInfo.sqliteDbFileSizeBytes),
      },
      {
        key: 'att-total',
        item: 'Attachments total size (metadata)',
        content: formatBytes(systemInfo.attachments.totalSizeBytes),
      },
    );
    if (systemInfo.attachments.perProject.length > 0) {
      out.push({
        key: 'att-by-project',
        item: 'Attachments by project',
        content: (
          <Box
            component="div"
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              maxHeight: '12rem',
              overflowY: 'auto',
              pr: 0.5,
            }}
          >
            {systemInfo.attachments.perProject.map((p) => (
              <Box key={p.projectId} component="div">
                <Box component="span" sx={{ color: 'rgb(244 244 245)' }}>
                  {p.projectName} — {p.attachmentCount} file(s), {formatBytes(p.totalSizeBytes)}
                </Box>
                <Box component="div" sx={{ color: 'rgb(113 113 122)', mt: 0.25, fontSize: '0.75rem' }}>
                  {p.projectId}
                </Box>
              </Box>
            ))}
          </Box>
        ),
      });
    }
    out.push(
      {
        key: 'fe-path',
        item: 'fastembed cache path',
        content: shortenPath(systemInfo.fastembedCache.path),
      },
      {
        key: 'fe-size',
        item: 'fastembed cache size',
        content: formatBytes(systemInfo.fastembedCache.sizeBytes),
      },
    );
    return out;
  }, [appVersion, systemInfo]);

  return (
    <TableContainer component={Paper} elevation={0} sx={systemInfoTableSx}>
      <Table size="small" aria-label="System information">
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...systemInfoHeadCellSx, width: '38%' }}>Item</TableCell>
            <TableCell sx={systemInfoHeadCellSx}>Content</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell sx={systemInfoItemCellSx}>{row.item}</TableCell>
              <TableCell sx={systemInfoContentCellSx}>{row.content}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export function AdminSection({ user }: AdminSectionProps) {
  const navigate = useNavigate();
  const [exportAllOpen, setExportAllOpen] = useState(false);
  const [exportDbOpen, setExportDbOpen] = useState(false);
  const [importWizardOpen, setImportWizardOpen] = useState(false);
  const [bannerDialogOpen, setBannerDialogOpen] = useState(false);
  const [dbSnapshotsOpen, setDbSnapshotsOpen] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    if (user.role !== 'admin') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiJson<SystemInfo>('/api/admin/system-info');
        if (!cancelled) setSystemInfo(res);
      } catch (e) {
        console.error(e);
        if (!cancelled) setSystemInfo(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user.role]);

  if (user.role !== 'admin') return null;

  const appVersion = getAppVersion();

  return (
    <>
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">Administration (admin)</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/admin/users"
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-md text-sm font-medium transition-colors"
          >
            User Management
          </Link>
          <Link
            to="/admin/groups"
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-md text-sm font-medium transition-colors"
          >
            Group Management
          </Link>
          <button
            type="button"
            onClick={() => setBannerDialogOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-sm font-medium text-zinc-200 transition-colors"
          >
            <Megaphone className="w-4 h-4 text-violet-400 shrink-0" />
            Instance banner
          </button>
          <button
            type="button"
            onClick={() => setDbSnapshotsOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-sm font-medium text-zinc-200 transition-colors"
          >
            <Archive className="w-4 h-4 text-violet-400 shrink-0" />
            DB snapshots
          </button>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold mb-4">Import & Export (admin)</h2>
        <div className="flex flex-col gap-3">
          {isBackendEnabled() && (
            <button
              type="button"
              onClick={() => setImportWizardOpen(true)}
              className="flex items-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm text-zinc-200 transition-colors text-left w-full"
            >
              <Upload className="w-4 h-4 text-violet-400 shrink-0" />
              <div>
                <div className="font-medium">Import from Jira</div>
                <div className="text-xs text-zinc-500">Import tasks from Jira Cloud into a new project</div>
              </div>
            </button>
          )}
          <button
            type="button"
            onClick={() => setExportAllOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm text-zinc-200 transition-colors text-left w-full"
          >
            <Download className="w-4 h-4 text-violet-400 shrink-0" />
            <div>
              <div className="font-medium">Export All Projects (ZIP)</div>
              <div className="text-xs text-zinc-500">Download project data as CSV + JSON for restoration</div>
            </div>
          </button>
          <button
            type="button"
            onClick={() => setExportDbOpen(true)}
            className="flex items-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm text-zinc-200 transition-colors text-left w-full"
          >
            <Database className="w-4 h-4 text-violet-400 shrink-0" />
            <div>
              <div className="font-medium">Export Database (ZIP)</div>
              <div className="text-xs text-zinc-500">Download SQLite database for backup or migration</div>
            </div>
          </button>
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold">System Info (admin)</h2>
        <div className="mt-3">
          <SystemInfoTable appVersion={appVersion} systemInfo={systemInfo} />
        </div>
      </div>

      <ExportAllProjectsDialog open={exportAllOpen} onClose={() => setExportAllOpen(false)} />
      <ExportDatabaseDialog open={exportDbOpen} onClose={() => setExportDbOpen(false)} />
      <BannerSettingsDialog open={bannerDialogOpen} onClose={() => setBannerDialogOpen(false)} />
      <DbSnapshotsDialog open={dbSnapshotsOpen} onClose={() => setDbSnapshotsOpen(false)} />
      <ImportWizard
        open={importWizardOpen}
        onClose={() => setImportWizardOpen(false)}
        onImportComplete={async (projectId) => {
          await fetchProjectState(projectId);
          setImportWizardOpen(false);
          navigate(`/p/${encodeURIComponent(projectId)}`, { replace: false });
        }}
      />
    </>
  );
}
