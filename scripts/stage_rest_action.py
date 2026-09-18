#!/usr/bin/env python3
"""Stage the Python REST action in the native tree consumed by vropkg.

Matches Build Tools' polyglotpkg VroTree XML and bundle layout. This lets one
Maven project package TypeScript, imported native objects and the Python action.
"""
import argparse
import json
from pathlib import Path
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'src/lab/actions/rest'


def stage(output):
    config = json.loads((SOURCE / 'action.json').read_text())
    version = ET.parse(ROOT / 'pom.xml').getroot().find('{http://maven.apache.org/POM/4.0.0}version').text.removesuffix('-SNAPSHOT')
    directory = Path(output) / 'ScriptModule' / config['module'].replace('.', '/')
    directory.mkdir(parents=True, exist_ok=True)
    name = config['name']
    action = ET.Element('dunes-script-module', {'name':name,'result-type':config['resultType'],
        'api-version':'6.0.0','id':config['id'],'version':version,'allowed-operations':'vfe',
        'memory-limit':str(config['memoryLimitMb'] * 1000000), 'timeout':str(config['timeoutSeconds'])})
    ET.SubElement(action, 'description').text = config['description']
    ET.SubElement(action, 'runtime').text = config['runtime']
    ET.SubElement(action, 'entry-point').text = config['entrypoint']
    for key, kind in config['inputs'].items():
        ET.SubElement(action, 'param', {'n':key,'t':kind})
    info = ET.Element('properties')
    ET.SubElement(info, 'comment').text = 'UTF-16'
    for key, value in {'categoryPath':config['module'],'type':'ScriptModule','id':config['id']}.items():
        ET.SubElement(info, 'entry', {'key':key}).text = value
    for suffix, xml in [('.xml',action),('.element_info.xml',info),('.tags.xml',ET.Element('tags'))]:
        ET.indent(xml)
        ET.ElementTree(xml).write(directory / (name + suffix), encoding='utf-8', xml_declaration=True)
    with zipfile.ZipFile(directory / (name + '.bundle.zip'), 'w', zipfile.ZIP_DEFLATED) as bundle:
        item = zipfile.ZipInfo('handler.py', date_time=(2026,1,1,0,0,0))
        item.compress_type = zipfile.ZIP_DEFLATED
        item.external_attr = 0o100644 << 16
        bundle.writestr(item, (SOURCE / 'handler.py').read_bytes())
    return directory


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'target/vro-sources/xml/src/main/resources')
    args = parser.parse_args()
    print('Staged REST action:', stage(args.output))
