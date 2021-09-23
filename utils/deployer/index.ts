import { Signer } from 'ethers';

import DeployHelperContracts from './helper';
import DeployMaticContracts from './matic';
export default class DeployHelper {
    public helper: DeployHelperContracts;
    public matic: DeployMaticContracts;

    constructor(deployerSigner: Signer) {
        this.helper = new DeployHelperContracts(deployerSigner);
        this.matic = new DeployMaticContracts(deployerSigner);
    }
}
