import { Box, Typography } from '@mui/material';

interface RequestIdNoticeProps {
  requestId: string | null;
}

/** Non-intrusive diagnostic reference, safe to show to users. */
export function RequestIdNotice({
  requestId,
}: RequestIdNoticeProps): React.JSX.Element | null {
  if (requestId === null || requestId === '') return null;
  return (
    <Box component="details">
      <Typography
        component="summary"
        variant="caption"
        sx={{ cursor: 'pointer', color: 'text.secondary' }}
      >
        Technical details
      </Typography>
      <Typography
        component="code"
        variant="caption"
        sx={{
          display: 'block',
          mt: 0.5,
          p: 1,
          backgroundColor: 'background.default',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          wordBreak: 'break-all',
        }}
      >
        Request ID: {requestId}
      </Typography>
    </Box>
  );
}
