// Physical test readiness assessment over sanitized check-hub statuses ONLY.
// No USB access, filesystem read, exports, upload, or mutable device operations.
export const PHYSICAL_PROTOCOL='paseka-oneplus-readonly-physical-v1';
export const PHYSICAL_STAGES=Object.freeze(['S0_USB_IDENTITY','S1_FULL_ARCHIVE','S2_DISPOSABLE_RECOVERY','S3_EXTERNAL_ORIGINALS','S4_SIGNER_AND_ROLLBACK','S5_COLD_OFFLINE','S6_REAL_VIDEO_PIPELINE','S7_LOCAL_REPORT']);

function state(status,code){
  return {status,code};
}

export function assessPhysicalReadiness(report){
  if(report?.schema!=='paseka-offline-check-hub-v1' || !report.checks ||
     typeof report.checks!=='object')throw Error('INVALID_HUB_REPORT');
  const checks=report.checks;
  const usb=checks['oneplus-usb-metadata'];
  const exported=checks['full-indexeddb-export'];
  const device=usb?.status==='PASS' && usb?.proofLevel==='USB_DEVICE_PACKAGE_METADATA_ONLY';
  const archive=exported?.status==='PASS' && exported?.code==='EPHEMERAL_RESTORE_REOPEN_BYTES_VERIFIED' &&
    exported?.allArchivedStoresByteVerified===true;
  // An archive of some stores is not a complete all-source device backup.
  const steps={
    S0_USB_IDENTITY:device ? state('PASS','HARDWARE_AND_PACKAGE_METADATA_ATTESTED'):
      state('NEEDS_INPUT','PHYSICAL_USB_IDENTITY_NOT_VERIFIED'),
    S1_FULL_ARCHIVE:archive ? state('PARTIAL','LOCAL_IDB_EXPORT_VERIFIED_EXTERNAL_MEDIA_UNKNOWN'):
      state('BLOCKED','COMPLETE_LOCAL_IDB_EXPORT_NOT_VERIFIED'),
    S2_DISPOSABLE_RECOVERY:archive ? state('PARTIAL','LOCAL_EMULATED_REOPEN_ONLY_NO_DEVICE_RESTORE'):
      state('NOT_TESTED','NO_VERIFIED_LOCAL_EXPORT_FOR_REOPEN'),
    S3_EXTERNAL_ORIGINALS:state('BLOCKED','GALLERY_MEDIASTORE_AND_ORIGINAL_SHA_NOT_VERIFIED'),
    S4_SIGNER_AND_ROLLBACK:state('BLOCKED','DURABLE_MATCHED_SIGNER_AND_ROLLBACK_NOT_VERIFIED'),
    S5_COLD_OFFLINE:state('NOT_TESTED','NO_DEVICE_COLD_OFFLINE_SESSION'),
    S6_REAL_VIDEO_PIPELINE:state('FROZEN','V0_V6_AND_ORIGINAL_DELETE_NOT_AUTHORIZED'),
    S7_LOCAL_REPORT:state('NOT_TESTED','REPORT_WRITE_PENDING')
  };
  return {
    protocol:PHYSICAL_PROTOCOL,
    status:'READ_ONLY_PRECHECK_ONLY',
    steps,
    deviceWritePermitted:false,
    apkInstallPermitted:false,
    webviewStorageWritePermitted:false,
    originalDeletePermitted:false,
    fullOriginalRecoveryVerified:false,
    physicalEndToEndVerified:false,
    nextUserAction:device?'NONE_UNTIL_B01_B05_RESOLVED':'USB_CONNECT_AND_ONE_CLICK_ONLY_WHEN_USER_READY',
    stopReason:archive?'EXTERNAL_ORIGINALS_AND_SIGNER_UNVERIFIED':'B01_FULL_ARCHIVE_NOT_VERIFIED'
  };
}
