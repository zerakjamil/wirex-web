export interface CommandSuggestion {
  command: string
  description: string
  keywords?: string[]
}

export const CISCO_USER_EXEC_COMMANDS: CommandSuggestion[] = [
  { command: 'enable', description: 'Enter privileged EXEC mode (Router#)', keywords: ['en', 'privilege', 'admin'] },
  { command: 'ping <ip-address>', description: 'Send ICMP echo request to verify connectivity', keywords: ['icmp', 'test', 'reach'] },
  { command: 'traceroute <ip-address>', description: 'Trace network hops to destination IP', keywords: ['trace', 'hops'] },
  { command: 'show version', description: 'Display Cisco IOS software and hardware details', keywords: ['ver', 'uptime', 'hardware'] },
  { command: 'show clock', description: 'Display current system clock', keywords: ['time', 'date'] },
  { command: 'exit', description: 'Log off or exit current CLI session', keywords: ['quit', 'logout'] },
]

export const CISCO_PRIV_EXEC_COMMANDS: CommandSuggestion[] = [
  { command: 'configure terminal', description: 'Enter global configuration mode (config)#', keywords: ['conf', 't', 'config'] },
  { command: 'show ip interface brief', description: 'Display status and IP addresses of all interfaces', keywords: ['sh', 'ip', 'int', 'br', 'brief'] },
  { command: 'show ipv6 interface brief', description: 'Display IPv6 addresses and status of all interfaces', keywords: ['sh', 'ipv6', 'int', 'br', 'brief'] },
  { command: 'show ipv6 route', description: 'Display the IPv6 routing table', keywords: ['sh', 'ipv6', 'route', 'routes'] },
  { command: 'show ipv6 neighbors', description: 'Display the IPv6 neighbor discovery cache', keywords: ['sh', 'ipv6', 'ndp', 'neighbors'] },
  { command: 'show ip route', description: 'Display current IPv4 routing table', keywords: ['sh', 'route', 'gateway', 'routes'] },
  { command: 'show running-config', description: 'Display active configuration currently in RAM', keywords: ['sh', 'run', 'config'] },
  { command: 'show startup-config', description: 'Display saved configuration in NVRAM', keywords: ['sh', 'start'] },
  { command: 'show vlan brief', description: 'Display VLAN IDs, names, and assigned switchports', keywords: ['sh', 'vl', 'vlan', 'ports'] },
  { command: 'show interfaces trunk', description: 'Display active 802.1Q trunk links and allowed VLANs', keywords: ['sh', 'int', 'trunk'] },
  { command: 'show mac address-table', description: 'Display learned MAC address forwarding table', keywords: ['sh', 'mac', 'cam'] },
  { command: 'show spanning-tree', description: 'Display STP topology, root bridge ID, and port roles', keywords: ['sh', 'stp', 'root', 'bridge'] },
  { command: 'show ip dhcp binding', description: 'Display leased IP addresses and client MAC bindings', keywords: ['sh', 'dhcp', 'leases'] },
  { command: 'show ip protocols', description: 'Display active routing protocols (OSPF, RIP, EIGRP)', keywords: ['sh', 'protocols', 'ospf'] },
  { command: 'show ip ospf neighbor', description: 'Display OSPF adjacency states and neighbor IDs', keywords: ['sh', 'ospf', 'neighbor', 'adj'] },
  { command: 'show cdp neighbors', description: 'Display directly connected Cisco devices', keywords: ['sh', 'cdp', 'neighbors'] },
  { command: 'show access-lists', description: 'Display configured standard and extended ACL rules', keywords: ['sh', 'acl', 'access'] },
  { command: 'copy running-config startup-config', description: 'Save running configuration to NVRAM', keywords: ['copy', 'run', 'start', 'save'] },
  { command: 'write memory', description: 'Quickly write running configuration to NVRAM (wr)', keywords: ['wr', 'mem', 'save'] },
  { command: 'reload', description: 'Restart / reboot the router or switch', keywords: ['reboot', 'restart'] },
  { command: 'disable', description: 'Exit privileged EXEC back to user EXEC', keywords: ['exit'] },
]

export const CISCO_GLOBAL_CONFIG_COMMANDS: CommandSuggestion[] = [
  { command: 'hostname <name>', description: 'Set device hostname', keywords: ['name', 'host'] },
  { command: 'interface GigabitEthernet0/0/0', description: 'Enter GigabitEthernet0/0/0 interface configuration', keywords: ['int', 'gi0/0/0', 'gig'] },
  { command: 'interface FastEthernet0/1', description: 'Enter FastEthernet0/1 interface configuration', keywords: ['int', 'fa0/1', 'fast'] },
  { command: 'interface range FastEthernet0/1 - 24', description: 'Configure multiple switchports simultaneously', keywords: ['int', 'range', 'bulk'] },
  { command: 'interface vlan 1', description: 'Configure Switch Virtual Interface (SVI) for management', keywords: ['int', 'vlan', 'svi'] },
  { command: 'ip route 0.0.0.0 0.0.0.0 <next-hop>', description: 'Configure default static route (gateway of last resort)', keywords: ['ip', 'route', 'default', 'static'] },
  { command: 'ipv6 unicast-routing', description: 'Enable IPv6 unicast routing on the router', keywords: ['ipv6', 'routing', 'unicast'] },
  { command: 'ipv6 route <prefix>/<prefix-length> <next-hop>', description: 'Configure an IPv6 static route (e.g. 2001:db8:3::/64 2001:db8:2::1)', keywords: ['ipv6', 'route', 'static'] },
  { command: 'ip default-gateway <ip-address>', description: 'Configure default gateway for Layer 2 switch management', keywords: ['ip', 'default', 'gateway', 'gw'] },
  { command: 'vlan <vlan-id>', description: 'Create or configure a VLAN in database (e.g. vlan 10)', keywords: ['vlan', 'database'] },
  { command: 'ip dhcp pool <name>', description: 'Create and configure a DHCP server pool', keywords: ['dhcp', 'pool', 'server'] },
  { command: 'ip dhcp excluded-address <low> <high>', description: 'Exclude static IPs from DHCP allocation', keywords: ['dhcp', 'exclude', 'static'] },
  { command: 'router ospf 1', description: 'Enable OSPF routing process ID 1', keywords: ['router', 'ospf', 'routing'] },
  { command: 'router rip', description: 'Enable RIP routing process', keywords: ['router', 'rip'] },
  { command: 'spanning-tree vlan 1 root primary', description: 'Force switch to become STP root bridge for VLAN', keywords: ['stp', 'root', 'primary'] },
  { command: 'enable secret <password>', description: 'Set encrypted password for privileged EXEC mode', keywords: ['enable', 'secret', 'password'] },
  { command: 'line console 0', description: 'Configure console port login and password', keywords: ['line', 'con', 'console'] },
  { command: 'line vty 0 4', description: 'Configure virtual terminal lines for Telnet / SSH', keywords: ['line', 'vty', 'telnet', 'ssh'] },
  { command: 'service password-encryption', description: 'Encrypt all cleartext passwords in configuration', keywords: ['service', 'encrypt', 'password'] },
  { command: 'banner motd # Authorized Access Only #', description: 'Set message of the day login banner', keywords: ['banner', 'motd', 'warning'] },
  { command: 'ip routing', description: 'Enable IPv4 routing on Layer 3 multilayer switch', keywords: ['routing', 'l3', 'layer3'] },
  { command: 'exit', description: 'Exit global configuration mode back to privileged EXEC', keywords: ['end', 'quit'] },
]

export const CISCO_INTERFACE_CONFIG_COMMANDS: CommandSuggestion[] = [
  { command: 'ip address <ip> <subnet-mask>', description: 'Assign IPv4 address and subnet mask to interface', keywords: ['ip', 'add', 'address', 'mask'] },
  { command: 'ipv6 address <address>/<prefix-length>', description: 'Assign an IPv6 address to the interface (e.g. 2001:db8:1::1/64)', keywords: ['ipv6', 'address'] },
  { command: 'ipv6 address <prefix>/<prefix-length> eui-64', description: 'Assign an IPv6 address using an EUI-64 interface ID (e.g. 2001:db8:1::/64 eui-64)', keywords: ['ipv6', 'eui-64'] },
  { command: 'no shutdown', description: 'Enable / bring up interface (turn on port)', keywords: ['no', 'shut', 'up', 'enable'] },
  { command: 'shutdown', description: 'Administratively disable / shut down interface', keywords: ['shut', 'down', 'disable'] },
  { command: 'switchport mode access', description: 'Configure port as an access port connecting to host', keywords: ['sw', 'mo', 'acc', 'access'] },
  { command: 'switchport access vlan <vlan-id>', description: 'Assign access port to specific VLAN (e.g. vlan 10)', keywords: ['sw', 'acc', 'vl', 'vlan'] },
  { command: 'switchport mode trunk', description: 'Configure port as an 802.1Q trunk link', keywords: ['sw', 'mo', 'tr', 'trunk'] },
  { command: 'switchport trunk native vlan <id>', description: 'Set untagged 802.1Q native VLAN (e.g. vlan 99)', keywords: ['sw', 'tr', 'nat', 'native'] },
  { command: 'switchport trunk allowed vlan <list>', description: 'Specify allowed VLANs across trunk (e.g. 10,20,30)', keywords: ['sw', 'tr', 'allow', 'allowed'] },
  { command: 'switchport voice vlan <vlan-id>', description: 'Configure auxiliary voice VLAN for Cisco IP Phone', keywords: ['sw', 'voice', 'phone'] },
  { command: 'encapsulation dot1Q <vlan-id>', description: 'Configure 802.1Q encapsulation on router subinterface', keywords: ['encap', 'dot1q', 'subinterface'] },
  { command: 'description <text>', description: 'Add descriptive label to interface', keywords: ['desc', 'label'] },
  { command: 'duplex full', description: 'Set interface duplex mode to full duplex', keywords: ['duplex', 'full'] },
  { command: 'speed 1000', description: 'Set interface transmission speed (e.g. 100, 1000)', keywords: ['speed', 'mbps'] },
  { command: 'no ip address', description: 'Remove IP address configuration from interface', keywords: ['no', 'ip', 'remove'] },
  { command: 'exit', description: 'Exit interface configuration mode', keywords: ['end'] },
]

export const CISCO_DHCP_CONFIG_COMMANDS: CommandSuggestion[] = [
  { command: 'network 192.168.1.0 255.255.255.0', description: 'Define subnet and mask for DHCP pool addresses', keywords: ['net', 'network', 'subnet'] },
  { command: 'default-router <ip-address>', description: 'Specify default gateway advertised to DHCP clients', keywords: ['def', 'default', 'router', 'gateway'] },
  { command: 'dns-server <ip-address>', description: 'Specify DNS server IP for DHCP clients', keywords: ['dns', 'nameserver'] },
  { command: 'option 150 ip <tftp-cme-ip>', description: 'Configure Cisco IP Phone TFTP / CME Option 150', keywords: ['option', '150', 'tftp', 'voip'] },
  { command: 'exit', description: 'Exit DHCP configuration mode', keywords: ['end'] },
]

export const CISCO_ROUTER_OSPF_COMMANDS: CommandSuggestion[] = [
  { command: 'network <ip> <wildcard-mask> area 0', description: 'Advertise network in OSPF backbone area 0', keywords: ['net', 'network', 'area', 'wildcard'] },
  { command: 'router-id <ip-address>', description: 'Set manual OSPF 32-bit Router ID', keywords: ['id', 'rid'] },
  { command: 'passive-interface GigabitEthernet0/0/0', description: 'Suppress OSPF hello packets out of host interface', keywords: ['passive', 'suppress'] },
  { command: 'exit', description: 'Exit router configuration mode', keywords: ['end'] },
]

export const CISCO_VLAN_CONFIG_COMMANDS: CommandSuggestion[] = [
  { command: 'name <vlan-name>', description: 'Assign an ASCII descriptive name to this VLAN (e.g. name Sales)', keywords: ['name', 'rename', 'label', 'vlan', 'tag'] },
  { command: 'do show vlan brief', description: 'Display all VLANs, names, status, and assigned switchports', keywords: ['do', 'show', 'vlan', 'sh', 'vl', 'brief'] },
  { command: 'do show vlan id <id>', description: 'Display specific VLAN details by numeric ID', keywords: ['do', 'show', 'vlan', 'id'] },
  { command: 'do show vlan name <name>', description: 'Display specific VLAN details by name', keywords: ['do', 'show', 'vlan', 'name'] },
  { command: 'do show running-config', description: 'Display current running configuration while in submode', keywords: ['do', 'show', 'run'] },
  { command: 'do show ip interface brief', description: 'Check interface status and IP addresses', keywords: ['do', 'show', 'ip', 'int', 'brief'] },
  { command: 'no name', description: 'Reset VLAN name back to default (e.g. VLAN0010)', keywords: ['no', 'name', 'reset', 'default'] },
  { command: 'exit', description: 'Apply VLAN settings and return to global config mode', keywords: ['exit', 'apply', 'back'] },
  { command: 'end', description: 'Exit directly to privileged EXEC mode (#)', keywords: ['end', 'quit'] },
]

export const END_DEVICE_COMMANDS: CommandSuggestion[] = [
  { command: 'ipconfig', description: 'Display current IP address, subnet mask, and default gateway', keywords: ['ip', 'config', 'status'] },
  { command: 'ipconfig /all', description: 'Display detailed network configuration including MAC address and DNS', keywords: ['all', 'details', 'mac'] },
  { command: 'ipconfig /renew', description: 'Release and request a new IPv4 lease from DHCP server', keywords: ['renew', 'dhcp', 'request'] },
  { command: 'ping <ip-address>', description: 'Send ICMP echo request packets to verify destination connectivity', keywords: ['icmp', 'test', 'connectivity'] },
  { command: 'arp -a', description: 'Display local ARP table mapping IP addresses to MAC addresses', keywords: ['arp', 'mac', 'cache'] },
  { command: 'tracert <ip-address>', description: 'Trace network path and intermediate hops to target IP', keywords: ['trace', 'route', 'hops'] },
  { command: 'netstat', description: 'Display active TCP network connections and listening ports', keywords: ['ports', 'connections'] },
  { command: 'cls', description: 'Clear command prompt terminal screen', keywords: ['clear', 'clean'] },
]

export function getTerminalSuggestions(
  input: string,
  prompt: string,
  isEndDevice: boolean
): { suggestions: CommandSuggestion[]; ghostText: string } {
  const query = input.trim().toLowerCase()
  if (!query) return { suggestions: [], ghostText: '' }

  let commandPool: CommandSuggestion[] = []

  if (isEndDevice) {
    commandPool = END_DEVICE_COMMANDS
  } else {
    // Determine Cisco IOS mode from prompt string
    const isConfig = prompt.includes('(config') || prompt.includes('-config')
    if (prompt.includes('(config-vlan)#')) {
      commandPool = CISCO_VLAN_CONFIG_COMMANDS
    } else if (prompt.includes('(config-if)#') || prompt.includes('(config-subif)#')) {
      commandPool = [...CISCO_INTERFACE_CONFIG_COMMANDS, ...CISCO_GLOBAL_CONFIG_COMMANDS]
    } else if (prompt.includes('(dhcp-config)#')) {
      commandPool = CISCO_DHCP_CONFIG_COMMANDS
    } else if (prompt.includes('(config-router)#')) {
      commandPool = CISCO_ROUTER_OSPF_COMMANDS
    } else if (prompt.includes('(config)#')) {
      commandPool = CISCO_GLOBAL_CONFIG_COMMANDS
    } else if (prompt.endsWith('#')) {
      commandPool = CISCO_PRIV_EXEC_COMMANDS
    } else {
      commandPool = CISCO_USER_EXEC_COMMANDS
    }

    // In any config mode, if user types "do" or starts with "do ", offer privileged EXEC commands prefixed with "do "
    if (isConfig && (query.startsWith('do') || query.includes('show') || query.includes('sh'))) {
      const doCommands: CommandSuggestion[] = CISCO_PRIV_EXEC_COMMANDS.map((c) => ({
        command: `do ${c.command}`,
        description: `Run EXEC command from config mode: ${c.description}`,
        keywords: ['do', ...(c.keywords || [])],
      }))
      commandPool = [...commandPool, ...doCommands]
    }
  }

  // Score matches:
  // 1. Exact prefix match on command
  // 2. Starts with query after spaces / tokens
  // 3. Contains query in command string
  // 4. Matches keywords / description (fractional recall)
  const scored = commandPool
    .map((item) => {
      const cmdLower = item.command.toLowerCase()
      let score = 0

      if (cmdLower.startsWith(query)) {
        score = 100 - (cmdLower.length - query.length)
      } else {
        const tokens = cmdLower.split(/\s+/)
        const queryTokens = query.split(/\s+/)

        // If every token of query matches token prefixes in command
        const allTokensMatch = queryTokens.every((q) =>
          tokens.some((t) => t.startsWith(q))
        )
        if (allTokensMatch) {
          score = 75
        } else if (cmdLower.includes(query)) {
          score = 50
        } else if (item.keywords?.some((k) => k.startsWith(query) || k.includes(query))) {
          score = 30
        } else if (item.description.toLowerCase().includes(query)) {
          score = 20
        }
      }

      return { item, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item)

  const topSuggestions = scored.slice(0, 5)

  // Compute inline ghost text:
  let ghostText = ''
  if (topSuggestions.length > 0) {
    const best = topSuggestions[0].command
    if (best.toLowerCase().startsWith(query)) {
      ghostText = best.slice(input.length)
    }
  }

  return {
    suggestions: topSuggestions,
    ghostText,
  }
}
