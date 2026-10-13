import { Box, IconButton, Tooltip } from '@mui/material';
import Add from '@mui/icons-material/Add';
import CenterFocusStrong from '@mui/icons-material/CenterFocusStrong';
import Cloud from '@mui/icons-material/Cloud';
import Layers from '@mui/icons-material/Layers';
import Remove from '@mui/icons-material/Remove';

interface MapControlsProps {
  onRecenter: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  checkpointsVisible: boolean;
  onToggleCheckpoints: () => void;
  heatmapAvailable: boolean;
  heatmapVisible: boolean;
  onToggleHeatmap: () => void;
}

/** Compact floating control cluster; every button pairs an icon with an
 * accessible name and tooltip, and toggles expose `aria-pressed`. */
export function MapControls({
  onRecenter,
  onZoomIn,
  onZoomOut,
  checkpointsVisible,
  onToggleCheckpoints,
  heatmapAvailable,
  heatmapVisible,
  onToggleHeatmap,
}: MapControlsProps): React.JSX.Element {
  return (
    <Box
      role="group"
      aria-label="Map controls"
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.5,
        p: 0.5,
        borderRadius: 2,
        bgcolor: 'background.paper',
        boxShadow: 3,
      }}
    >
      <Tooltip title="Zoom in" placement="left">
        <IconButton aria-label="Zoom in" onClick={onZoomIn} size="small">
          <Add />
        </IconButton>
      </Tooltip>
      <Tooltip title="Zoom out" placement="left">
        <IconButton aria-label="Zoom out" onClick={onZoomOut} size="small">
          <Remove />
        </IconButton>
      </Tooltip>
      <Tooltip title="Recenter on route" placement="left">
        <IconButton aria-label="Recenter on route" onClick={onRecenter} size="small">
          <CenterFocusStrong />
        </IconButton>
      </Tooltip>
      <Tooltip
        title={checkpointsVisible ? 'Hide checkpoints' : 'Show checkpoints'}
        placement="left"
      >
        <IconButton
          aria-label="Toggle checkpoints"
          aria-pressed={checkpointsVisible}
          onClick={onToggleCheckpoints}
          size="small"
          sx={checkpointsVisible ? { bgcolor: 'action.selected' } : undefined}
        >
          <Layers />
        </IconButton>
      </Tooltip>
      <Tooltip
        title={
          heatmapAvailable
            ? heatmapVisible
              ? 'Hide weather heatmap'
              : 'Show weather heatmap'
            : 'Weather heatmap not loaded'
        }
        placement="left"
      >
        <span data-tour="heatmap-toggle">
          <IconButton
            aria-label="Toggle weather heatmap"
            aria-pressed={heatmapVisible}
            onClick={onToggleHeatmap}
            disabled={!heatmapAvailable}
            size="small"
            sx={
              heatmapVisible && heatmapAvailable
                ? { bgcolor: 'action.selected' }
                : undefined
            }
          >
            <Cloud />
          </IconButton>
        </span>
      </Tooltip>
    </Box>
  );
}
