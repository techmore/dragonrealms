"""Read-only, bounded screen samples from the isolated engine; not a transcript archive."""
import re
import time


def watch_snapshot(info):
    fields = ('room', 'last_command', 'commands', 'step', 'circle', 'requirement_gap',
              'simulated_seconds', 'death', 'guild', 'race', 'character_name')
    result = {key: info[key] for key in fields if key in info}
    result['captured_at'] = time.time()
    result['schema'] = 'dragonrealms.puffer.watch/1'
    result['messages'] = [re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]', '', text)[-2000:]
                          for text in info.get('last_messages', [])[-8:] if isinstance(text, str)]
    return result
