"""Choose presentation only; the upstream optimizer is unchanged."""
def native_dashboard(mode, is_tty):
    if mode not in ('auto', 'native', 'quiet'):
        raise ValueError('Unknown terminal dashboard mode')
    return mode == 'native' or (mode == 'auto' and is_tty)
