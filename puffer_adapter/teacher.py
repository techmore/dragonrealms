"""Transparent requirement-aware demonstration teacher, never a deployed policy.

Only reads public adapter observations. Real item prices must be supplied by the
engine. This is a curriculum teacher, not the production script benchmark.
"""
import math

TEACHER_VERSION = 'barbarian-requirement-and-economy-teacher/1'
WEAPONS = [('small_edged', 'dagger', 'knife_combat'), ('blunt', 'club', 'club_combat'),
           ('large_edged', 'broadsword', 'sword_combat'), ('staff', 'staff', 'staff_combat')]


def choose_activity(info, specification):
    if info.get('death') is not False or info.get('guild') != 'barbarian':
        raise ValueError('Teacher requires a known living Barbarian')
    rows = info.get('requirements', {}).get('rows', [])
    if not rows or info.get('requirements', {}).get('ok') not in (True, False):
        raise ValueError('Unknown requirement state')
    for row in rows:
        if any(type(row.get(k)) not in (int,float) or not math.isfinite(row[k]) for k in ('have','need')) or row['need'] <= 0:
            raise ValueError('Invalid requirement row')
    actions = specification['actions']
    def decision(name, reason):
        return {'action': actions.index(name), 'activity': name, 'reason': reason, 'teacher': TEACHER_VERSION}
    if info['requirements']['ok']:
        if any(row['have'] < row['need'] for row in rows):
            raise ValueError('Contradictory requirement state')
        return decision('guild', 'All current requirements satisfied; request earned circle')
    silver = info.get('silver')
    costs = specification.get('item_costs', {})
    inventory = info.get('inventory')
    equipment = info.get('equipment')
    if type(silver) not in (int, float) or not math.isfinite(silver) or silver < 0 or not isinstance(inventory,list) or not isinstance(equipment,dict):
        raise ValueError('Unknown economic state')
    owned = set(inventory) | set(equipment.values())
    # Combat buys armor and shield before the selected weapon. Fund the exact
    # outstanding kit through the real perform action; never grant money.
    for _, weapon, _ in WEAPONS:
        required = [item for item in ('padded_cloth','shield_wood',weapon) if item not in owned]
        if any(type(costs.get(item)) not in (int,float) or not math.isfinite(costs[item]) or costs[item] < 0 for item in required):
            raise ValueError('Missing engine item prices')
        if silver < sum(costs[item] for item in required):
            return decision('perform', f'Fund missing combat kit including {weapon}')
    deficits = {row['label']: row['need']-row['have'] for row in rows}
    needs = {row['label']: row['need'] for row in rows}
    skills = info.get('skills', {})
    def rank(skill):
        value = skills.get(skill, {}).get('rank')
        if type(value) is not int or value < 0:
            raise ValueError(f'Unknown rank: {skill}')
        return value
    # Priority covers dependencies, then the weakest required weapon lane.
    if any(deficits.get(label,0)>0 for label in ('inner_fire','1st supernatural')):
        return decision('barbarian_arts','Close Inner Fire/supernatural requirements')
    if any(deficits.get(label,0)>0 for label in ('1st lore','2nd lore')):
        return decision('study','Close two eligible lore lanes through scholarship/appraisal')
    if any(deficits.get(f'{n}{suffix} survival',0)>0 for n,suffix in [(1,'st'),(2,'nd'),(3,'rd'),(4,'th')]):
        # Four distinct supported lanes, not four pieces of the same skillset.
        survival = [('foraging','field_medicine'),('perception','stealth'),
                    ('stealth','stealth'),('first_aid','field_medicine')]
        for (skill,activity),(n,suffix) in zip(survival,[(1,'st'),(2,'nd'),(3,'rd'),(4,'th')]):
            if rank(skill) < needs.get(f'{n}{suffix} survival',0):
                return decision(activity, f'Close required survival lane {skill}')
    candidates = []
    for (skill,_,activity),(n,suffix) in zip(WEAPONS,[(1,'st'),(2,'nd'),(3,'rd'),(4,'th')]):
        need = needs.get(f'{n}{suffix} weapon',0)
        if need and rank(skill) < need:
            candidates.append(((need-rank(skill))/need, activity, skill))
    if candidates:
        _, activity, skill = max(candidates, key=lambda row:row[0])
        return decision(activity, f'Close required weapon lane {skill}')
    if any(deficits.get(label,0)>0 for label in ('expertise','melee_mastery','parry','evasion','tactics','1st armor','2nd armor')):
        return decision('knife_combat','Close remaining combat/defense requirements')
    raise ValueError('Unmapped requirement gap; teacher refuses to guess')
