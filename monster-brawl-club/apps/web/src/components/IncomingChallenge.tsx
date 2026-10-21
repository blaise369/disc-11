import { useEffect, useState } from 'react';
import type { Stake } from '@mbc/shared';
import { useSession } from '../lib/session';
import { request } from '../lib/socket';
import { MonsterCard } from './MonsterCard';
import { STAKE_INFO, StakePicker } from './stakes';
import { Button, Modal, useCountdown } from './ui';

export function IncomingChallenge() {
  const { incoming, socket, run, dismissIncoming } = useSession();
  const f = incoming[0];
  const theirStake = (f?.a.stake ?? 'bite') as Stake;
  const allowed: Stake[] = theirStake === 'bite' ? ['bite'] : ['collect', 'eat'];
  const [stake, setStake] = useState<Stake>('bite');
  const [busy, setBusy] = useState(false);
  const left = useCountdown(f?.deadline ?? null);
  useEffect(() => setStake(allowed[0] ?? 'bite'), [f?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!f || !socket) return null;

  const respond = async (accept: boolean) => {
    setBusy(true);
    const ok = await run(() => request(socket, 'challenge:respond', { fightId: f.id, accept, stake }));
    setBusy(false);
    if (ok || !accept) dismissIncoming(f.id);
  };

  return (
    <Modal open wide>
      <h2 className="text-center font-display text-3xl text-flame text-outline">⚔️ Challenge!</h2>
      <p className="text-center"><b>{f.a.username}</b> wants to fight! <span className="font-bold">{left}s</span> to answer.</p>
      <div className="my-3 flex items-center justify-center gap-3">
        <MonsterCard m={f.a.monster} size="sm" />
        <span className="font-display text-3xl">VS</span>
        <MonsterCard m={f.b.monster} size="sm" flip />
      </div>
      <p className="text-center text-sm">
        Their stake: <b>{STAKE_INFO[theirStake].icon} {STAKE_INFO[theirStake].label}</b> · {f.roundsPlanned} skill round{f.roundsPlanned === 1 ? '' : 's'}
      </p>
      <p className="mb-2 text-center text-xs opacity-70">Each player's own stake decides what happens if <i>they</i> win.</p>
      <h3 className="font-display">Pick your stake</h3>
      <StakePicker value={stake} onChange={setStake} allowed={allowed} />
      <div className="mt-4 flex justify-center gap-3">
        <Button colour="grey" onClick={() => void respond(false)} disabled={busy}>Decline</Button>
        <Button colour="green" onClick={() => void respond(true)} disabled={busy} data-testid="accept-challenge">Accept!</Button>
      </div>
    </Modal>
  );
}
