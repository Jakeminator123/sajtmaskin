import { describe, expect, it } from "vitest";
import { isResolvedAddressPrivate } from "./ssrf-address";

const PRIVATE_IPV4 = [
  ["0.0.0.0/8 this-network", "0.0.0.0"],
  ["0.0.0.0/8 this-network", "0.255.255.255"],
  ["10.0.0.0/8 RFC1918", "10.0.0.1"],
  ["10.0.0.0/8 RFC1918", "10.255.255.255"],
  ["100.64.0.0/10 CGNAT", "100.64.0.1"],
  ["100.64.0.0/10 CGNAT", "100.127.255.254"],
  ["127.0.0.0/8 loopback", "127.0.0.1"],
  ["127.0.0.0/8 loopback", "127.255.255.255"],
  ["169.254.0.0/16 link-local", "169.254.169.254"],
  ["172.16.0.0/12 RFC1918", "172.16.0.1"],
  ["172.16.0.0/12 RFC1918", "172.31.255.255"],
  ["192.0.0.0/24 IETF protocol", "192.0.0.8"],
  ["192.0.2.0/24 TEST-NET-1", "192.0.2.1"],
  ["192.88.99.0/24 6to4 anycast", "192.88.99.1"],
  ["192.168.0.0/16 RFC1918", "192.168.1.1"],
  ["198.18.0.0/15 benchmarking", "198.18.0.1"],
  ["198.18.0.0/15 benchmarking", "198.19.255.255"],
  ["198.51.100.0/24 TEST-NET-2", "198.51.100.1"],
  ["203.0.113.0/24 TEST-NET-3", "203.0.113.1"],
  ["224.0.0.0/4 multicast", "224.0.0.1"],
  ["224.0.0.0/4 multicast", "239.255.255.255"],
  ["240.0.0.0/4 reserved", "240.0.0.1"],
  ["255.255.255.255 broadcast", "255.255.255.255"],
] as const;

const PUBLIC_IPV4 = [
  "1.1.1.1",
  "8.8.8.8",
  "93.184.216.34",
  "100.63.255.255",
  "100.128.0.1",
  "172.15.255.255",
  "172.32.0.1",
  "192.0.1.1",
  "198.20.0.1",
] as const;

const PRIVATE_IPV6 = [
  [":: unspecified", "::"],
  ["::1 loopback", "::1"],
  ["::ffff:0:0/96 mapped loopback dotted", "::ffff:127.0.0.1"],
  ["::ffff:0:0/96 mapped loopback hex", "::ffff:7f00:1"],
  ["::ffff:0:0/96 mapped this-network", "::ffff:0:0"],
  ["::ffff:0:0/96 mapped RFC1918 expanded", "0:0:0:0:0:ffff:c0a8:1"],
  ["64:ff9b::/96 NAT64", "64:ff9b::1"],
  ["64:ff9b::/96 NAT64 embedded public IPv4", "64:ff9b::8.8.8.8"],
  ["100::/64 discard", "100::1"],
  ["2001:db8::/32 documentation", "2001:db8::1"],
  ["2001:db8::/32 documentation", "2001:db8:ffff::1"],
  ["2001::/32 Teredo", "2001::1"],
  ["2001::/32 Teredo encoded client", "2001:0:53aa:64c:0:0:c0a8:1"],
  ["fc00::/7 unique-local", "fc00::1"],
  ["fc00::/7 unique-local", "fd12:3456:789a::1"],
  ["fe80::/10 link-local", "fe80::1"],
  ["fe80::/10 link-local", "febf::1"],
  ["ff00::/8 multicast", "ff02::1"],
] as const;

const PUBLIC_IPV6 = [
  "2606:4700:4700::1111",
  "2001:4860:4860::8888",
  "2001:1::1",
  "101::1",
  "64:ff9a::1",
  "::ffff:8.8.8.8",
  "::ffff:0808:0808",
] as const;

describe("isResolvedAddressPrivate", () => {
  it.each(PRIVATE_IPV4)("blocks IPv4 %s (%s)", (_label, address) => {
    expect(isResolvedAddressPrivate(address)).toBe(true);
  });

  it.each(PUBLIC_IPV4)("allows globally routed IPv4 %s", (address) => {
    expect(isResolvedAddressPrivate(address)).toBe(false);
  });

  it.each(PRIVATE_IPV6)("blocks IPv6 %s (%s)", (_label, address) => {
    expect(isResolvedAddressPrivate(address)).toBe(true);
  });

  it.each(PUBLIC_IPV6)("allows globally routed IPv6 %s", (address) => {
    expect(isResolvedAddressPrivate(address)).toBe(false);
  });

  it("classifies the embedded IPv4 of a mapped address, not the /96 prefix itself", () => {
    expect(isResolvedAddressPrivate("::ffff:1.1.1.1")).toBe(false);
    expect(isResolvedAddressPrivate("::ffff:169.254.169.254")).toBe(true);
    expect(isResolvedAddressPrivate("::ffff:c000:201")).toBe(true); // 192.0.2.1
  });

  it("classifies deprecated IPv4-compatible ::/96 via the embedded IPv4", () => {
    expect(isResolvedAddressPrivate("::169.254.169.254")).toBe(true);
    expect(isResolvedAddressPrivate("::127.0.0.1")).toBe(true);
    expect(isResolvedAddressPrivate("::10.0.0.1")).toBe(true);
    // Policy: do not blanket-block ::/96. A public embedded IPv4 stays public.
    expect(isResolvedAddressPrivate("::8.8.8.8")).toBe(false);
  });

  it("fails closed on unparseable addresses", () => {
    expect(isResolvedAddressPrivate("not-an-ip")).toBe(true);
    expect(isResolvedAddressPrivate("")).toBe(true);
  });
});
