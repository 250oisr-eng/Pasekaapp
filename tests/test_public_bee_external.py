import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"tools"))
import probe_public_bee_external as p
import numpy as np
class ExternalTests(unittest.TestCase):
    def test_pollen_is_not_bee_and_xml_dimensions(self):
        raw=b"<annotation><size><width>100</width><height>50</height></size>"+b"".join(b"<object><name>"+k+b"</name><bndbox><xmin>1</xmin><ymin>2</ymin><xmax>10</xmax><ymax>20</ymax></bndbox></object>" for k in (b"bee",b"pollen"))+b"</annotation>"
        bees,counts=p.parse_voc(raw,100,50);self.assertEqual(len(bees),1);self.assertEqual(counts,{"bee":1,"pollen":1})
        with self.assertRaises(ValueError):p.parse_voc(raw,90,50)
    def test_xml_entity_rejected(self):
        with self.assertRaises(ValueError):p.parse_voc(b'<!DOCTYPE annotation [<!ENTITY x "x">]><annotation/>',1,1)
    def test_empty_decode(self):
        raw=np.zeros((5,90,96),np.float32);raw[0]=-100
        b,s=p.decode(raw);self.assertEqual(b.shape,(0,4));self.assertEqual(len(s),0)
if __name__=="__main__":unittest.main()
