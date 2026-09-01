import os, tempfile, importlib.util, pathlib
ROOT=pathlib.Path(__file__).parent
tmp=tempfile.mkdtemp()
os.environ['MAINT_AI_DB']=str(pathlib.Path(tmp)/'test.db')
spec=importlib.util.spec_from_file_location('appserver',ROOT/'server.py')
m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
m.init_db()
c=m.save_case_record({'trade':'HVAC','complaint':'not cooling','manufacturer':'Goodman','model':'GSX123','measurements':{'superheat':28,'subcooling':3},'repair':'Repaired leak and charged to target','verification':'Delta T and charge verified'})
assert c['trade']=='HVAC'
rows=m.list_case_records()
assert len(rows)==1 and rows[0]['model']=='GSX123'
intel=m.field_case_intelligence({'current':{'trade':'HVAC','manufacturer':'Goodman','model':'GSX123','complaint':'not cooling'},'history':rows})
assert intel['total_matches']>=1
parsed=m.parse_field_language('110 suction, 360 head, 1 degree superheat and 12 degrees subcooling')
assert parsed['low_psig']==110 and parsed['high_psig']==360 and parsed['superheat']==1 and parsed['subcooling']==12
parsed_drier=m.parse_field_language('filter drier inlet temp 96 and filter drier outlet temp 89')
assert parsed_drier['drier_in_temp']==96 and parsed_drier['drier_out_temp']==89
dx=m.evidence_analysis({'trade':'HVAC','complaint':'evaporator freezes','measurements':{'superheat':31,'subcooling':24,'drier_in_temp':96,'drier_out_temp':89}})
assert dx['ranked_diagnoses'][0]['title']=='Likely restricted liquid-line filter drier'
assert dx['ranked_diagnoses'][0]['confidence_components']['field_evidence']==92
print('production tests passed')
