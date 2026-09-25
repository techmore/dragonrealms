"""Reserve immutable independent evaluation output, rejecting reused seeds."""
import json


def reserve_validation(root, source_run, validation_id, seeds, episodes):
    if (not isinstance(validation_id,str) or not validation_id.startswith('puffer-validation-')
            or not validation_id.replace('-','').isalnum() or validation_id == source_run):
        raise ValueError('Invalid independent validation ID')
    if (not isinstance(seeds,list) or len(seeds)!=episodes or len(set(seeds))!=episodes
            or any(type(seed) is not int or not 1000<=seed<=2147483647 for seed in seeds)):
        raise ValueError('Validation requires distinct held-out seeds matching the episode count')
    # Global recorded evaluations are excluded, including earlier candidates;
    # partial validations reserve their seeds even when no final report exists.
    used=set()
    for path in root.glob('*/evaluation.json'):
        used.update(row['seed'] for row in json.loads(path.read_text()).get('rows',[]) if 'seed' in row)
    for path in root.glob('*/manifest.json'):
        used.update(json.loads(path.read_text()).get('validation_seeds',[]))
    if used.intersection(seeds):
        raise ValueError('Validation seeds overlap previously recorded evaluation seeds')
    output=root/validation_id
    output.mkdir(exist_ok=False)
    return output,list(seeds)
