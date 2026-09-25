"""Independent wall-clock budget for frozen evaluation, not optimizer tuning."""


def evaluation_deadline(seconds, now):
    if type(seconds) is not int or not 1 <= seconds <= 3600:
        raise ValueError('evaluation seconds must be 1..3600')
    return now + seconds
