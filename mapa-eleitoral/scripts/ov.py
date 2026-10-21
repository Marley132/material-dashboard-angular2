import sys, time, pyarrow.dataset as ds, pyarrow.fs as pfs, pyarrow.parquet as pq
REL='overturemaps-us-west-2/release/2026-09-23.1'
fs=pfs.S3FileSystem(anonymous=True, region='us-west-2')
def q(theme,typ,bbox,cols,out,extra=None):
    t0=time.time()
    d=ds.dataset(f"{REL}/theme={theme}/type={typ}/",filesystem=fs,format='parquet')
    w,s,e,n=bbox; b=lambda k: ds.field('bbox',k)
    f=(b('xmin')<e)&(b('xmax')>w)&(b('ymin')<n)&(b('ymax')>s)
    if extra is not None: f=f&extra
    t=d.to_table(columns=cols,filter=f)
    pq.write_table(t,out); print(theme,typ,t.num_rows,round(time.time()-t0),'s')
if __name__=='__main__':
    S=sys.argv[1]; what=sys.argv[2]
    if what=='div':
        q('divisions','division_area',(-41.0,-10.1,-39.9,-9.2),['id','names','subtype','class','country','geometry'],S+'/ov/div.parquet')
    if what=='seg':
        q('transportation','segment',(-41.0,-10.1,-39.9,-9.2),['id','subtype','class','names','geometry'],S+'/ov/seg.parquet',ds.field('subtype')=='road')
    if what=='water':
        q('base','water',(-41.0,-10.1,-39.9,-9.2),['id','subtype','class','names','geometry'],S+'/ov/water.parquet')
