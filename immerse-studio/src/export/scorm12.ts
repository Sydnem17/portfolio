import JSZip from 'jszip';
import type { Course } from '../schema/course';
import { buildCourseHtml, escapeHtml } from './standaloneHtml';
import { loadPlayerAssets } from './playerAssets';

/**
 * SCORM 1.2 package: a zip with imsmanifest.xml at the ROOT (the #1 upload
 * failure is nesting it in a folder) and a single self-contained SCO.
 * The player finds window.API in the LMS frame chain at runtime.
 */
function buildManifest(course: Course): string {
  const id = course.id.replace(/[^A-Za-z0-9_-]/g, '_') || 'course';
  const title = escapeHtml(course.title);
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${id}_manifest" version="1.2"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="${id}_org">
    <organization identifier="${id}_org">
      <title>${title}</title>
      <item identifier="${id}_item" identifierref="${id}_res" isvisible="true">
        <title>${title}</title>
        <adlcp:masteryscore>${Math.round(course.passingScore)}</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="${id}_res" type="webcontent" adlcp:scormtype="sco" href="index.html">
      <file href="index.html"/>
    </resource>
  </resources>
</manifest>`;
}

export async function exportScorm12(course: Course): Promise<Blob> {
  const { js, css } = await loadPlayerAssets();
  const zip = new JSZip();
  zip.file('imsmanifest.xml', buildManifest(course));
  zip.file('index.html', buildCourseHtml(course, js, css));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
