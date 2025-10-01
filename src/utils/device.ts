export function isMobileDevice(): boolean {
  const navigatorWithUAData = navigator as Navigator & {
    userAgentData?: {
      mobile?: boolean;
    };
  };

  const uaData = navigatorWithUAData.userAgentData;
  if (typeof uaData?.mobile === "boolean") {
    return uaData.mobile;
  }

  const userAgent = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|IEMobile|BlackBerry|Opera Mini/i.test(userAgent);
}

export {};
