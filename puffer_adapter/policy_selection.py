"""Frozen, reproducible policy decisions without touching global RNG state."""
import torch


def select_action(policy, observation, *, sampled=False, generator=None):
    return select_decision(policy, observation, sampled=sampled, generator=generator)['action']


def select_decision(policy, observation, *, sampled=False, generator=None):
    """Decision plus probabilities from the same forward pass and RNG draw."""
    if sampled and generator is None:
        raise ValueError('Sampled evaluation requires an explicit seeded generator')
    with torch.no_grad():
        logits, _ = policy(torch.as_tensor(observation).unsqueeze(0))
        if logits.ndim != 2 or logits.shape[0] != 1 or not torch.isfinite(logits).all():
            raise ValueError('Invalid policy logits')
        probabilities = logits.softmax(dim=-1)
        action = int(torch.multinomial(probabilities, 1, generator=generator).item()) if sampled else int(logits.argmax(dim=-1).item())
        return dict(action=action, probabilities=probabilities[0].cpu().tolist(), sampled=sampled)
