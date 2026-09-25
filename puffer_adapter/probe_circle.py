"""Bounded feasibility baseline, explicitly NOT a learned-policy milestone."""
import json
import time
from .environment import DragonRealmsEnv, ROOT

def main():
    env=DragonRealmsEnv('circling')
    output=ROOT/'public/live/puffer/circle-feasibility.json'
    start=time.monotonic()
    try:
        env.reset(seed=42)
        for step in range(512):
            action=step%env.action_space.n
            obs,reward,terminated,truncated,info=env.step(action)
            if step%9==8 or terminated:
                state=dict(kind='scripted feasibility baseline, not learned policy',
                    elapsed=time.monotonic()-start,**env.last_info)
                output.write_text(json.dumps(state,indent=2))
                print(json.dumps({k:state[k] for k in ['step','elapsed','circle','requirement_gap','death','room']}),flush=True)
            if terminated or truncated or time.monotonic()-start>120: break
    finally:env.close()

if __name__=='__main__':main()
