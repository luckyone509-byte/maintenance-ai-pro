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
print('production tests passed')
